import React from 'react'

export default function SliderCard() {
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

  const card = { background: 'var(--bg-primary)', borderRadius: 16, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow)', overflow: 'hidden' }
  // Outer stage preserves aspect ratio; inner viewport adds safe padding so rounded corners don't clip UI
  const stage = { position: 'relative', paddingTop: '62.5%', background: 'var(--bg-secondary)' } // 16:10
  const viewport = { position: 'absolute', inset: 0, padding: 12, borderRadius: 12, overflow: 'hidden' }
  const caption = { textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', padding: '10px 12px' }
  const dots = { display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }
  const dot = (active) => ({ width: active ? 24 : 10, height: 10, borderRadius: 9999, background: active ? 'var(--accent-color)' : 'var(--bg-tertiary)', border: 0, cursor: 'pointer' })

  return (
    <div>
      <div style={card}>
        <div style={stage}>
          <div style={viewport}>
            {slides.map((s, i) => (
              <img
                key={s.src}
                src={`${imgBase}/${s.src}`}
                alt={s.caption}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: i === idx ? 1 : 0, transition: 'opacity 700ms', background: 'var(--bg-secondary)' }}
              />
            ))}
          </div>
        </div>
        <div style={caption}>{slides[idx].caption}</div>
      </div>
      <div style={dots}>
        {slides.map((_, i) => (
          <button key={i} aria-label={`Go to slide ${i + 1}`} onClick={() => setIdx(i)} style={dot(i === idx)} />
        ))}
      </div>
    </div>
  )
}
