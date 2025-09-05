import React, { useState } from 'react'

const Auth = () => {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // PKCE helpers
  const base64url = (input) => {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(input)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }
  const sha256 = async (plain) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(plain)
    return await crypto.subtle.digest('SHA-256', data)
  }
  const generatePkce = async () => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const verifier = Array.from(array).map(b => ('0' + b.toString(16)).slice(-2)).join('')
    const hashed = await sha256(verifier)
    const challenge = base64url(hashed)
    return { verifier, challenge }
  }

  // Detect OAuth or direct callback
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (code) {
      // Dev-mode React StrictMode runs effects twice on mount.
      // Guard token exchange so we don't call oauth-token twice.
      const lockKey = `hasu_oauth_exchange_lock:${code}`
      if (sessionStorage.getItem(lockKey)) {
        console.log('OAuth exchange already attempted for this code, skipping duplicate')
        return
      }
      sessionStorage.setItem(lockKey, '1')
      // OAuth flow - exchange code for tokens
      const storedVerifier = sessionStorage.getItem('hasu_pkce_verifier')
      if (storedVerifier) {
        handleOAuthCallback(code, storedVerifier)
      } else {
        setMessage('PKCE verifier not found. Please try logging in again.')
      }
    } else if (accessToken && refreshToken) {
      // Guard direct callback path as well to avoid duplicate migrations in StrictMode
      const lockKey = `hasu_supakey_callback_lock:${accessToken.substring(0,16)}`
      if (sessionStorage.getItem(lockKey)) {
        console.log('Supakey callback already handled for this token, skipping duplicate')
        return
      }
      sessionStorage.setItem(lockKey, '1')
      // Direct flow - use provided tokens
      handleSupakeyCallback(accessToken, refreshToken)
    }
  }, [])

  const handleOAuthCallback = async (code, codeVerifier) => {
    try {
      setLoading(true)
      setMessage('Exchanging authorization code for tokens...')

      const supakeyUrl = process.env.REACT_APP_SUPAKEY_URL
      const clientId = process.env.REACT_APP_SUPAKEY_CLIENT_ID || 'hasu-web'
      const redirectUri = window.location.origin

      console.log('OAuth callback params:', { supakeyUrl, clientId, redirectUri, code: code?.substring(0, 10) + '...', codeVerifier: codeVerifier?.substring(0, 10) + '...' })

      if (!supakeyUrl) {
        setMessage('REACT_APP_SUPAKEY_URL environment variable not set. Please set it to your Supabase project URL (e.g. https://yourproject.supabase.co)')
        setLoading(false)
        return
      }

      // Use edge function for token exchange (must go to actual Supabase project)
      const tokenUrl = `${supakeyUrl}/functions/v1/oauth-token`
      console.log('Calling token endpoint:', tokenUrl)

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.REACT_APP_SUPAKEY_ANON_KEY || '',
          'Authorization': `Bearer ${process.env.REACT_APP_SUPAKEY_ANON_KEY || ''}`
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: codeVerifier
        })
      })

      console.log('Token response status:', response.status)
      const result = await response.json()
      console.log('Token response:', result)

      if (!response.ok) {
        const errorMessage = result.message || result.error || `OAuth token exchange failed: ${response.status}`
        const details = result.details ? `\nDetails: ${JSON.stringify(result.details, null, 2)}` : ''
        setMessage(`${errorMessage}${details}`)
        setLoading(false)
        return
      }

      // After OAuth, deploy Hasu migrations
      const { supakeyIntegration } = await import('../lib/supakeyIntegration')
      setMessage('Deploying migrations...')
      const deployResult = await supakeyIntegration.deployHasuMigrations(result.access_token)
      if (!deployResult.success) {
        setMessage(`Migration deployment failed: ${deployResult.error}`)
        setLoading(false)
        return
      }

      // Then retrieve application-specific tokens via a dedicated function
      setMessage('Retrieving application tokens...')
      const appId = deployResult.tokens?.applicationId || null
      const appIdentifier = process.env.REACT_APP_HASU_APP_IDENTIFIER || 'github.com/aksanoble/hasu'
      const tokenRes = await supakeyIntegration.getApplicationTokens(result.access_token, {
        applicationId: appId,
        appIdentifier
      })
      if (!tokenRes.success) {
        setMessage(`Failed to retrieve application tokens: ${tokenRes.error}`)
        setLoading(false)
        return
      }

      const tokens = tokenRes.tokens

      // Persist tokens for AuthContext restore
      const authTokens = {
        ...tokens,
        // Always prefer application-specific user from issue-app-tokens
        userId: tokens.userId,
        // Prefer any email provided with app tokens; otherwise fall back to Supakey email for display only
        email: tokens.email || result.email || null
      }
      // Store only what the frontend needs to connect: URL and anon key.
      // Do NOT store or propagate any service/secret keys.
      supakeyIntegration.saveTokens(authTokens, {
        supabaseUrl: tokens.databaseUrl,
        anonKey: tokens.anonKey || null
      })

      // Cleanup URL and session storage
      const cleanUrl = window.location.origin + window.location.pathname
      window.history.replaceState({}, document.title, cleanUrl)
      sessionStorage.removeItem('hasu_pkce_verifier')

      setMessage('Signed in via Supakey OAuth successfully!')
      setLoading(false)

      // Trigger refresh by reloading app state
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('OAuth callback error:', error)

      // Check if this is a PGRST002 schema cache error
      if (error.message && error.message.includes('PGRST002')) {
        console.log('🔄 PGRST002 error detected, waiting 5 seconds for PostgREST cache refresh...')
        setMessage('PostgREST is refreshing schema cache, please wait...')

        // Wait 5 seconds for PostgREST schema cache to refresh
        await new Promise(resolve => setTimeout(resolve, 5000))

        // Retry the entire OAuth flow
        console.log('🔄 Retrying OAuth callback after cache refresh delay...')
        setMessage('Retrying authentication...')
        return await handleOAuthCallback(code, codeVerifier)
      }

      setMessage(`OAuth callback error: ${error.message}`)
      setLoading(false)
    }
  }

  const handleSupakeyCallback = async (accessToken, refreshToken) => {
    try {
      setLoading(true)
      setMessage('Setting up Hasu application...')

      // Import integration and deploy migrations
      const { supakeyIntegration } = await import('../lib/supakeyIntegration')
      console.log('Deploying Hasu migrations with Supakey user tokens...')
      const migrationResult = await supakeyIntegration.deployHasuMigrations(accessToken)
      if (!migrationResult.success) {
        throw new Error(migrationResult.error || 'Migration deployment failed')
      }
      console.log('Migrations deployed. Retrieving application tokens...')

      const appIdentifier = process.env.REACT_APP_HASU_APP_IDENTIFIER || 'github.com/aksanoble/hasu'
      const tokenRes = await supakeyIntegration.getApplicationTokens(accessToken, { appIdentifier })
      if (!tokenRes.success) {
        throw new Error(tokenRes.error || 'Failed to retrieve application tokens')
      }

      const tokens = tokenRes.tokens
      // Save the app-specific tokens
      supakeyIntegration.saveTokens({
        ...tokens,
        email: 'user@supakey.com'
      }, {
        supabaseUrl: tokens.databaseUrl,
        anonKey: tokens.anonKey
      })

      setMessage('Setup complete - Redirecting...')

      // Cleanup URL
      const cleanUrl = window.location.origin + window.location.pathname
      window.history.replaceState({}, document.title, cleanUrl)

      // Small delay to show the message, then reload
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('Supakey callback error:', error)

      // Check if this is a PGRST002 schema cache error
      if (error.message && error.message.includes('PGRST002')) {
        console.log('🔄 PGRST002 error detected in Supakey callback, waiting 5 seconds for PostgREST cache refresh...')
        setMessage('PostgREST is refreshing schema cache, please wait...')

        // Wait 5 seconds for PostgREST schema cache to refresh
        await new Promise(resolve => setTimeout(resolve, 5000))

        // Retry the entire callback flow
        console.log('🔄 Retrying Supakey callback after cache refresh delay...')
        setMessage('Retrying setup...')
        return await handleSupakeyCallback(accessToken, refreshToken)
      }

      setMessage(`Setup failed: ${error.message}`)
      setLoading(false)
    }
  }


  return (
    <div className="auth-container" style={{ backgroundColor: '#ede4d1' }}>
      <div style={{ 
        textAlign: 'center', 
        backgroundColor: '#ede4d1',
        padding: '40px',
        maxWidth: '500px',
        margin: '0 auto'
      }}>
        <img src="/logo512.png" alt="Hasu" style={{ 
          width: 120, 
          height: 120, 
          marginBottom: 24, 
          display: 'block', 
          marginLeft: 'auto', 
          marginRight: 'auto',
          borderRadius: '60px'
        }} />
        <h1 style={{ 
          fontSize: '1.75rem', 
          fontWeight: '700', 
          color: '#2d3748', 
          marginBottom: '8px',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: '-0.01em'
        }}>
          Hasu
        </h1>
        <p style={{ 
          fontSize: '1rem', 
          fontWeight: '400', 
          color: '#2d3748', 
          marginBottom: '8px',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
          The free forever and private todo app
        </p>
        <p style={{ 
          fontSize: '0.95rem', 
          color: '#4a5568', 
          marginBottom: '32px',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          lineHeight: '1.6'
        }}>
          Sign in with your Supakey account to access your todos.
        </p>
        
        <button type="button" disabled={loading} onClick={async () => {
          try {
            setLoading(true)
            setMessage('')

            // Start PKCE OAuth with Supakey frontend authorize route
            const { verifier, challenge } = await generatePkce()
            sessionStorage.setItem('hasu_pkce_verifier', verifier)

            const clientId = process.env.REACT_APP_SUPAKEY_CLIENT_ID || 'hasu-web'
            const redirectUri = encodeURIComponent(window.location.origin)
            const appIdentifier = encodeURIComponent(process.env.REACT_APP_HASU_APP_IDENTIFIER || 'github.com/aksanoble/hasu')
            const supakeyBaseUrl = process.env.REACT_APP_SUPAKEY_FRONTEND_URL || 'http://localhost:5173'

            const authUrl = `${supakeyBaseUrl}/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&response_type=code&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256&app_identifier=${appIdentifier}`

            window.location.href = authUrl
          } catch (e) {
            console.error('Failed to start OAuth flow:', e)
            setMessage('Failed to start authentication')
            setLoading(false)
          }
        }} style={{
          width: '100%',
          padding: '12px 20px',
          backgroundColor: '#2563eb',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '1rem',
          fontWeight: '600',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          cursor: loading ? 'not-allowed' : 'pointer',
          marginTop: '20px',
          opacity: loading ? 0.7 : 1,
          transition: 'opacity 0.2s ease'
        }}>
          Login with Supakey
        </button>

        {message && (
          <div className={`message ${message.includes('error') || message.includes('Invalid') || message.includes('failed') ? 'error' : 'success'}`} 
               style={{ 
                 marginTop: '16px', 
                 padding: '12px 16px',
                 borderRadius: '8px',
                 fontSize: '0.9rem',
                 fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                 backgroundColor: message.includes('error') || message.includes('Invalid') || message.includes('failed') ? '#fed7d7' : '#c6f6d5',
                 color: message.includes('error') || message.includes('Invalid') || message.includes('failed') ? '#c53030' : '#22543d',
                 border: `1px solid ${message.includes('error') || message.includes('Invalid') || message.includes('failed') ? '#feb2b2' : '#9ae6b4'}`
               }}>
            {message}
          </div>
        )}

        <div style={{ 
          textAlign: 'center', 
          marginTop: '40px', 
          paddingTop: '20px', 
          borderTop: '1px solid #e2d5c0' 
        }}>
          <a 
            href="https://github.com/aksanoble/hasu" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              color: '#4a5568',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.target.style.color = '#2d3748'}
            onMouseLeave={(e) => e.target.style.color = '#4a5568'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  )
}

export default Auth
