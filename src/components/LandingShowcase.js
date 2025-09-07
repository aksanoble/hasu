import React from 'react'

export default function LandingShowcase() {
  const container = { maxWidth: '1200px', margin: '24px auto', padding: '0 16px' }
  const gridBase = { display: 'grid', gridTemplateColumns: '1fr', gap: 24, alignItems: 'center' }
  const gridWide = { display: 'grid', gridTemplateColumns: '7fr 3fr', gap: 32, alignItems: 'center' }
  const [wide, setWide] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : false))
  React.useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Colors respect app theme via CSS variables
  const card = { background: 'var(--bg-primary)', borderRadius: 16, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow)', overflow: 'hidden' }
  const stage = { position: 'relative', paddingTop: '62.5%', background: 'var(--bg-secondary)' } // 16:10
  const caption = { textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', padding: '10px 12px' }
  const dots = { display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }
  const dot = (active) => ({ width: active ? 24 : 10, height: 10, borderRadius: 9999, background: active ? 'var(--accent-color)' : 'var(--bg-tertiary)', border: 0, cursor: 'pointer' })
  const kicker = { color: 'var(--accent-color)', fontWeight: 600, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' }
  const title = { fontWeight: 700, fontSize: 28, color: 'var(--text-primary)', marginTop: 4 }
  const text = { color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.7 }

  const imgBase = '/screenshots'
  const slides = [
    { src: 'hasu-screenshot-01.png', caption: 'Dark theme' },
    { src: 'hasu-screenshot-02.png', caption: 'Create Projects' },
    { src: 'hasu-screenshot-03.png', caption: 'Today View' },
    { src: 'hasu-screenshot-04.png', caption: 'Quick Add Task' },
    { src: 'hasu-screenshot-05.png', caption: 'Completed Tasks' }
  ]
  const [idx, setIdx] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % slides.length), 3500)
    return () => clearInterval(id)
  }, [])

  return (
    <section style={container}>
      <div style={wide ? gridWide : gridBase}>
        {/* Left slider */}
        <div>
          <div style={card}>
            <div style={stage}>
              {slides.map((s, i) => (
                <img key={s.src} src={`${imgBase}/${s.src}`} alt={s.caption}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: i === idx ? 1 : 0, transition: 'opacity 700ms' }} />
              ))}
            </div>
            <div style={caption}>{slides[idx].caption}</div>
          </div>
          <div style={dots}>
            {slides.map((_, i) => (
              <button key={i} aria-label={`Go to slide ${i + 1}`} onClick={() => setIdx(i)} style={dot(i === idx)} />
            ))}
          </div>
        </div>

        {/* Right text */}
        <div>
          <div style={kicker}>Hasu Preview</div>
          <div style={title}>Your todos, powered by your Supabase</div>
          <p style={text}>Hasu runs entirely on your own Supabase project. Connect it via Supakey, deploy the schema with one click, and keep all your data private and under your control.</p>
          <ul style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
            <li>• Projects, favorites, and quick add</li>
            <li>• Today, Upcoming, and Completed views</li>
            <li>• Realtime updates and search</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

