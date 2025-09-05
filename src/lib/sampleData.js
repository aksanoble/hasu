import { projectService, todoService } from './supabase'

// Minimal retry helper for transient PostgREST cache issues
async function withRetry(fn, {
  attempts = 3,
  delayMs = 2000,
  label = 'operation'
} = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const msg = String(e?.message || '')
      const retryable = /PGRST002|postgrest|relation|schema/i.test(msg)
      if (!retryable || i === attempts - 1) break
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

export async function ensureSampleData(userId) {
  if (!userId) return

  // Avoid duplicate init in StrictMode reloads
  const lockKey = `hasu:sample-init:${userId}`
  if (sessionStorage.getItem(lockKey)) return
  sessionStorage.setItem(lockKey, '1')

  try {
    // If any project exists, assume user is initialized
    const projects = await withRetry(() => projectService.getProjects(), { label: 'get projects' })
    if (projects?.length) return

    // Ensure Inbox
    let inbox
    try {
      inbox = await withRetry(() => projectService.getInboxProject(), { label: 'get inbox' })
    } catch {
      inbox = await withRetry(() => projectService.createProject('Inbox', 'blue', false, userId, true), { label: 'create inbox' })
    }

    // Ensure Dev Sandbox
    const existing = await withRetry(() => projectService.getProjects(), { label: 'get projects (2)' })
    const sample = existing.find(p => p.name === 'Dev Sandbox')
      || await withRetry(() => projectService.createProject('Dev Sandbox', 'green', false, userId), { label: 'create sample project' })

    const todayIso = new Date().toISOString()
    // Inbox tasks
    await withRetry(() => todoService.createTodo('Welcome to Hasu! Quick-capture your tasks here.', inbox.id, todayIso, userId))
    await withRetry(() => todoService.createTodo('Press Q to quick add from anywhere.', inbox.id, todayIso, userId))
    // Sample project tasks
    await withRetry(() => todoService.createTodo('Clone repo and run npm install', sample.id, todayIso, userId))
    await withRetry(() => todoService.createTodo('Wire up Supabase client for user DB', sample.id, todayIso, userId))
    const done = await withRetry(() => todoService.createTodo('Ship first PR', sample.id, todayIso, userId))
    await withRetry(() => todoService.updateTodo(done.id, { completed: true }))
  } catch (e) {
    // Non-fatal
    console.warn('Sample data setup skipped:', e?.message || e)
  } finally {
    sessionStorage.removeItem(lockKey)
  }
}

