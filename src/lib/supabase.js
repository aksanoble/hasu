import { createClient } from '@supabase/supabase-js'

// Helper function to derive schema name from app identifier (matches edge function logic)
export function deriveSchemaName(appIdentifier) {
  // Convert "github.com/aksanoble/hasu" to "github_com_aksanoble_hasu"
  return appIdentifier
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
}

// Main client for user's target database (uses JWT auth with correct schema)
export let userDataClient = null

/**
 * Initialize the user data client with JWT authentication.
 * This client connects to the user's target database with proper schema access.
 * We'll set the session directly after creating the client.
 */
export async function initUserDataClient(databaseUrl, jwt, refreshToken, schema = null, anonKey = null) {
  // If no schema provided, derive it from the app identifier
  if (!schema) {
    const appIdentifier = process.env.REACT_APP_HASU_APP_IDENTIFIER || 'github.com/aksanoble/hasu'
    schema = deriveSchemaName(appIdentifier)
  }
  
  console.log('🔧 Initializing userDataClient with:', {
    databaseUrl,
    schema,
    appIdentifier: process.env.REACT_APP_HASU_APP_IDENTIFIER
  })
  
  const options = {
    db: { schema }, // Use the correct schema for the app
    auth: { persistSession: false }, // Don't persist auth as we manage it ourselves
  }
  
  // Validate that anonKey belongs to the same project as databaseUrl; otherwise ignore it.
  let effectiveAnonKey = null
  try {
    const urlHost = new URL(databaseUrl).hostname
    const expectedRef = urlHost.split('.')[0]
    const candidate = anonKey
    if (candidate) {
      const parts = candidate.split('.')
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload && payload.ref === expectedRef) {
          effectiveAnonKey = candidate
        } else {
          console.warn('Ignoring anonKey due to project ref mismatch', { expectedRef, gotRef: payload?.ref })
        }
      }
    }
  } catch (e) {
    // If parsing fails, fall back to using JWT as key
  }
  // Fallback: if anonKey is absent or invalid, use jwt to allow client creation
  if (!effectiveAnonKey) effectiveAnonKey = jwt
  
  userDataClient = createClient(databaseUrl, effectiveAnonKey, options)
  
  // Set the session directly with our JWT
  try {
    // Basic inspection of provided jwt for debugging
    const jwtInfo = (() => {
      try {
        if (!jwt) return null
        const p = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        return { role: p.role, ref: p.ref, iss: p.iss, sub: p.sub }
      } catch {
        return null
      }
    })()
    if (jwtInfo) console.log('🔎 JWT payload before setSession:', jwtInfo)

    await userDataClient.auth.setSession({
      access_token: jwt,
      refresh_token: refreshToken
    })
    console.log('✅ User data client session set successfully')

    const { data: sessionRes } = await userDataClient.auth.getSession()
    const at = sessionRes?.session?.access_token
    const payload = (() => {
      try {
        if (!at) return null
        const p = JSON.parse(atob(at.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        return { role: p.role, ref: p.ref, iss: p.iss, sub: p.sub }
      } catch {
        return null
      }
    })()
    if (payload) console.log('🛡️ Active access token payload:', payload)
  } catch (error) {
    console.error('❌ Failed to set user data client session:', error)
    throw error
  }
  
  try {
    if (typeof window !== 'undefined' && window && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('hasu:user-data-client-initialized', { detail: { databaseUrl, schema } }))
    }
  } catch (e) {
    // ignore
  }
  return userDataClient
}

// Note: userDataClient is initialized by AuthContext after Supakey authentication

// Project-related functions
export const projectService = {
  // Get all projects for the current user
  async getProjects() {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient // Use userDataClient if available, fallback to legacy
    const { data, error } = await client
      .from('hasutodo_projects')
      .select('*')
      .order('is_inbox', { ascending: false }) // Inbox first
      .order('is_favorite', { ascending: false }) // Then favorites
      .order('name', { ascending: true }) // Then alphabetically

    if (error) throw error
    return data
  },

  // Get favorite projects only
  async getFavoriteProjects() {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_projects')
      .select('*')
      .eq('is_favorite', true)
      .order('name', { ascending: true })

    if (error) throw error
    return data
  },

  // Get regular projects (not inbox, not favorites)
  async getRegularProjects() {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_projects')
      .select('*')
      .eq('is_inbox', false)
      .eq('is_favorite', false)
      .order('name', { ascending: true })

    if (error) throw error
    return data
  },

  // Get inbox project
  async getInboxProject() {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_projects')
      .select('*')
      .eq('is_inbox', true)
      .single()

    if (error) throw error
    return data
  },

  // Create or ensure inbox project exists for user
  async ensureInboxProject(userId) {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    
    // Call the database function to create/get inbox project
    const { data, error } = await client.rpc('create_default_inbox_project', {
      user_uuid: userId
    })

    if (error) throw error
    return data // Returns the inbox project ID
  },

  // Create a new project
  async createProject(name, color = 'blue', isFavorite = false, userId = null, isInbox = false) {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_projects')
      .insert([{
        name,
        color,
        is_favorite: isFavorite,
        is_inbox: isInbox,
        user_id: userId
      }])
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Update a project
  async updateProject(id, updates) {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Delete a project (cannot delete inbox)
  async deleteProject(id) {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { error } = await client
      .from('hasutodo_projects')
      .delete()
      .eq('id', id)
      .eq('is_inbox', false) // Prevent deleting inbox

    if (error) throw error
  },

  // Get project with todo count (excluding completed todos)
  async getProjectsWithCounts() {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_projects')
      .select(`
        *,
        hasutodo_todos!left(id, completed)
      `)
      .order('is_inbox', { ascending: false })
      .order('is_favorite', { ascending: false })
      .order('name', { ascending: true })

    if (error) throw error
    
    // Transform the data to include todo counts (only non-completed todos)
    return data.map(project => ({
      ...project,
      todoCount: project.hasutodo_todos ? project.hasutodo_todos.filter(todo => !todo.completed).length : 0
    }))
  }
}

// Enhanced todo functions to work with projects
export const todoService = {
  // Get todos for a specific project
  async getTodosByProject(projectId) {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_todos')
      .select(`
        *,
        project:hasutodo_projects(*)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  // Get all todos with project information
  async getTodosWithProjects() {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_todos')
      .select(`
        *,
        project:hasutodo_projects(*)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  // Create todo with project assignment
  async createTodo(text, projectId = null, dueDate = null, userId = null) {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_todos')
      .insert([{
        text,
        project_id: projectId,
        due_date: dueDate,
        user_id: userId
      }])
      .select(`
        *,
        project:hasutodo_projects(*)
      `)
      .single()

    if (error) throw error
    return data
  },

  // Update todo
  async updateTodo(id, updates) {
    if (!userDataClient) {
      throw new Error('User data client not initialized. Please authenticate first.')
    }
    const client = userDataClient
    const { data, error } = await client
      .from('hasutodo_todos')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        project:hasutodo_projects(*)
      `)
      .single()

    if (error) throw error
    return data
  },

  // Move todo to different project
  async moveTodoToProject(todoId, projectId) {
    return await this.updateTodo(todoId, { project_id: projectId })
  }
}
