import React, { useState, useEffect, useCallback } from 'react'
import { todoService, userDataClient, deriveSchemaName } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AddTaskModal from './AddTaskModal'
import { updateAndroidWidget } from '../lib/widgetHelper'
import './TodoList.css'

const toLocalISODate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const dateOnlyStr = (s) => (s ? String(s).split('T')[0] : '')
const localDateStr = (s) => {
  if (!s) return ''
  const d = new Date(s)
  return toLocalISODate(d)
}

const TodoList = ({ selectedProject, onAddTodo, isAddTaskModalOpen, onCloseAddTaskModal }) => {
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [activeResultIdx, setActiveResultIdx] = useState(0)
  const [activeTodoMenuId, setActiveTodoMenuId] = useState(null)

  // Handle click outside to close dropdowns and modals
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close todo menu dropdowns when clicking outside
      if (activeTodoMenuId && !event.target.closest('.project-menu')) {
        setActiveTodoMenuId(null)
      }
      
      // Close search modal when clicking outside
      if (isSearchOpen && !event.target.closest('.search-modal')) {
        setIsSearchOpen(false)
        setSearchQuery('')
        setSearchResults([])
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [activeTodoMenuId, isSearchOpen])

  const fetchTodos = useCallback(async () => {
    try {
      let data
      if (selectedProject && typeof selectedProject === 'object' && selectedProject.id) {
        data = await todoService.getTodosByProject(selectedProject.id)
        // Show only non-completed tasks in project view to align with sidebar counts
        data = (data || []).filter(t => !t.completed)
      } else if (selectedProject === 'today') {
        data = await todoService.getTodosWithProjects()
        const todayStr = toLocalISODate(new Date())
        // Show only tasks that are due today (local) or overdue
        data = data.filter(todo => {
          if (!todo.due_date || todo.completed) return false
          const dStr = localDateStr(todo.due_date)
          return dStr && dStr <= todayStr
        })
        data = data.sort((a, b) => new Date(a.due_date || a.created_at) - new Date(b.due_date || b.created_at))
      } else if (selectedProject === 'upcoming') {
        data = await todoService.getTodosWithProjects()
        const todayStr = toLocalISODate(new Date())
        data = data.filter(todo => !todo.completed && todo.due_date && dateOnlyStr(todo.due_date) > todayStr)
      } else if (selectedProject === 'completed') {
        data = await todoService.getTodosWithProjects()
        data = data.filter(todo => todo.completed)
        data = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      } else {
        data = await todoService.getTodosWithProjects()
        data = data.filter(todo => !todo.completed)
      }
      setTodos(data || [])
    } catch (error) { console.error('Error fetching todos:', error) } finally { setLoading(false) }
  }, [selectedProject])

  const setupRealtimeSubscription = useCallback(() => {
    if (!userDataClient) {
      console.warn('User data client not initialized, skipping realtime subscription')
      return () => {}
    }
    const channel = userDataClient
      .channel('todos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: deriveSchemaName(process.env.REACT_APP_HASU_APP_IDENTIFIER || 'github.com/aksanoble/hasu'),
          table: 'hasutodo_todos',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => { handleRealtimeChange(payload) }
      )
      .subscribe()
    return () => { userDataClient.removeChannel(channel) }
  }, [user, selectedProject])

  useEffect(() => {
    if (!user) return
    const cleanup = setupRealtimeSubscription()
    fetchTodos()
    return () => { if (cleanup) cleanup() }
  }, [user, selectedProject, fetchTodos, setupRealtimeSubscription])

  useEffect(() => {
    if (!user) return
    const onKey = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      if ((isMac && e.metaKey && e.key.toLowerCase() === 'k') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault(); setIsSearchOpen(true); setTimeout(() => setActiveResultIdx(0), 0)
      }
    }
    const onOpen = () => { setIsSearchOpen(true); setActiveResultIdx(0) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-search-modal', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-search-modal', onOpen) }
  }, [user])

  useEffect(() => { if (user) { updateAndroidWidget(todos, true) } }, [todos, user])

  useEffect(() => {
    const run = async () => {
      if (!isSearchOpen || !user) return
      if (!searchQuery.trim()) { setSearchResults([]); setActiveResultIdx(0); return }
      const { data, error } = await userDataClient
        .from('hasutodo_todos')
        .select('*')
        .eq('user_id', user.id)
        .ilike('text', `%${searchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!error) {
        setSearchResults(data || [])
        setActiveResultIdx(0)
      }
    }
    run()
  }, [isSearchOpen, searchQuery, user])


  const qualifiesForCurrentView = (todo) => {
    if (!todo) return false
    if (selectedProject && typeof selectedProject === 'object' && selectedProject.id) {
      return !todo.completed && todo.project_id === selectedProject.id
    }
    const todayStr = toLocalISODate(new Date())
    if (selectedProject === 'today') {
      return !!todo.due_date && !todo.completed && localDateStr(todo.due_date) <= todayStr
    }
    if (selectedProject === 'upcoming') {
      return !!todo.due_date && !todo.completed && localDateStr(todo.due_date) > todayStr
    }
    if (selectedProject === 'completed') {
      return !!todo.completed
    }
    // default (Inbox/All Active): non-completed
    return !todo.completed
  }

  const handleRealtimeChange = (payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload
    if (eventType === 'INSERT') {
      if (!qualifiesForCurrentView(newRecord)) return
      setTodos(prev => (prev.some(t => t.id === newRecord.id) ? prev : [newRecord, ...prev]))
      return
    }
    if (eventType === 'UPDATE') {
      const stillQualifies = qualifiesForCurrentView(newRecord)
      setTodos(prev => {
        const exists = prev.some(t => t.id === newRecord.id)
        if (stillQualifies) {
          return exists ? prev.map(t => t.id === newRecord.id ? newRecord : t) : [newRecord, ...prev]
        }
        // no longer qualifies: remove if present
        return prev.filter(t => t.id !== newRecord.id)
      })
      return
    }
    if (eventType === 'DELETE') {
      setTodos(prev => prev.filter(t => t.id !== oldRecord.id))
    }
  }

  const addTodo = async (text, dueDate = null, projectId = null) => {
    try {
      const finalProjectId = projectId || (selectedProject && typeof selectedProject === 'object' ? selectedProject.id : null)
      await todoService.createTodo(text, finalProjectId, dueDate, user.id)
      // Strictly rely on realtime notifications to update the view
      if (onAddTodo) onAddTodo()
    } catch (error) { console.error('Error adding todo:', error) }
  }

  const updateTodoFields = async ({ id, text, due_date, project_id }) => {
    try {
      const { error } = await userDataClient.from('hasutodo_todos').update({ text, due_date, project_id }).eq('id', id)
      if (error) throw error
      setIsEditModalOpen(false); setEditTask(null)
    } catch (e) { console.error('Error updating todo:', e) }
  }

  const toggleTodo = async (id) => {
    const todo = todos.find(t => t.id === id)
    if (!todo) return
    const newCompletedState = !todo.completed

    // Optimistic UI update
    if (selectedProject === 'completed' && !newCompletedState) {
      // If we're in Completed view and un-completing, remove it from the list immediately
      setTodos(prev => prev.filter(t => t.id !== id))
    } else if (selectedProject && typeof selectedProject === 'object' && newCompletedState) {
      // In project view, hide completed items to match sidebar counts
      setTodos(prev => prev.filter(t => t.id !== id))
    } else {
      setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: newCompletedState } : t))
    }

    try {
      const { error } = await userDataClient.from('hasutodo_todos').update({ completed: newCompletedState }).eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error updating todo:', error)
      // Revert on error
      if (selectedProject === 'completed' && !newCompletedState) {
        // Re-add the removed item if revert needed
        setTodos(prev => [todo, ...prev])
      } else if (selectedProject && typeof selectedProject === 'object' && newCompletedState) {
        // Re-add if we removed for project view but update failed
        setTodos(prev => [todo, ...prev])
      } else {
        setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !newCompletedState } : t))
      }
    }
  }

  const toggleTodoFromSearch = async (id) => {
    const r = searchResults.find(t => t.id === id)
    if (!r) return
    const newCompletedState = !r.completed
    setSearchResults(prev => prev.map(t => t.id === id ? { ...t, completed: newCompletedState } : t))
    try { const { error } = await userDataClient.from('hasutodo_todos').update({ completed: newCompletedState }).eq('id', id); if (error) throw error } catch (error) { console.error('Error updating todo:', error); setSearchResults(prev => prev.map(t => t.id === id ? { ...t, completed: !newCompletedState } : t)) }
  }


  const deleteTodo = async (id) => {
    // optimistic remove
    const prev = todos
    setTodos(prev.filter(t => t.id !== id))
    try {
      const { error } = await userDataClient.from('hasutodo_todos').delete().eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error deleting todo:', error)
      setTodos(prev) // revert
    }
  }

  const formatDate = (dateString) => { if (!dateString) return ''; const date = new Date(dateString); return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

  const getTaskPriorityColor = (todo) => {
    if (todo.due_date) {
      const today = new Date(); const dueDate = new Date(todo.due_date); today.setHours(0,0,0,0); dueDate.setHours(0,0,0,0)
      if (dueDate < today) return 'priority-overdue'
      if (dueDate.getTime() === today.getTime()) return 'priority-today'
    }
    return 'priority-upcoming'
  }

  const isOverdue = (todo) => {
    if (!todo.due_date) return false
    const todayStr = toLocalISODate(new Date())
    return localDateStr(todo.due_date) < todayStr
  }

  const openEdit = (todo) => { setEditTask(todo); setIsEditModalOpen(true) }

  if (loading) return (<div className="flex-1 flex items-center justify-center"><div>Loading...</div></div>)

  const todayStr = toLocalISODate(new Date())
  const dueTodayTodos = todos
    .filter(todo => !todo.completed && todo.due_date && localDateStr(todo.due_date) === todayStr)
    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
  const overdueTodos = todos
    .filter(todo => !todo.completed && todo.due_date && localDateStr(todo.due_date) < todayStr)
    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
  const upcomingTodos = todos
    .filter(todo => !todo.completed && todo.due_date && localDateStr(todo.due_date) > todayStr)
    .sort((a,b)=> new Date(a.due_date)-new Date(b.due_date))
  const somedayTodos = todos.filter(todo => !todo.completed && !todo.due_date).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
  const activeTodos = [] // not used; separate sections handle overdue/today/upcoming/someday

  const getProjectTitle = () => {
    if (selectedProject && typeof selectedProject === 'object') return selectedProject.name
    if (selectedProject === 'today') return 'Today'
    if (selectedProject === 'upcoming') return 'Upcoming'
    if (selectedProject === 'completed') return 'Completed Tasks'
    return 'Today'
  }

  const TodoRowActions = ({ todo }) => (
    <div className="relative group">
      <div className="relative project-menu">
        <button onClick={() => setActiveTodoMenuId(activeTodoMenuId === todo.id ? null : todo.id)} className="task-actions p-1 rounded transition-opacity">
          <span className="material-icons text-sm">more_vert</span>
        </button>
        {activeTodoMenuId === todo.id && (
          <div className="absolute right-0 top-6 w-36 task-dropdown rounded-md shadow-lg z-50">
            <div className="py-1">
              <button onClick={() => { deleteTodo(todo.id); setActiveTodoMenuId(null) }} className="w-full text-left px-3 py-2 text-sm delete flex items-center space-x-2">
                <span className="material-icons text-sm">delete</span>
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col h-full todo-list-container">
      <header className="flex items-center justify-between p-4 todo-header">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg">{getProjectTitle()}</h2>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto min-h-full">
          {selectedProject === 'today' ? (
            <>
              {/* Due Today first */}
              {(() => {
                const todayStr = toLocalISODate(new Date())
                const dueToday = todos.filter(t => !t.completed && dateOnlyStr(t.due_date) === todayStr).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
                const overdue = todos.filter(t => !t.completed && t.due_date && dateOnlyStr(t.due_date) < todayStr).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
                return (
                  <>
                    {dueToday.length > 0 && (
                      <div className="mb-8">
                        <h2 className="text-sm font-semibold section-title mb-4">Due Today</h2>
                        <div className="space-y-3">
                          {dueToday.map(todo => (
                            <div key={todo.id} className="task-item group flex items-center justify-between py-2">
                              <div className="flex items-center space-x-3">
                                <button onClick={() => toggleTodo(todo.id)} className={`w-5 h-5 border-2 ${getTaskPriorityColor(todo)} rounded-full cursor-pointer hover:bg-opacity-20 transition-colors`}>{todo.completed && (<span className="material-icons text-xs text-center leading-5 text-green-400">check</span>)}</button>
                                <button className="text-left" onClick={() => openEdit(todo)}>
                                  <p className={`${todo.completed ? 'line-through opacity-50' : ''}`}>{todo.text}</p>
                                </button>
                              </div>
                              <div className="flex items-center space-x-4 text-sm task-meta">
                                {todo.due_date && (<span className="flex items-center space-x-1"><span className="material-icons text-sm">calendar_today</span><span>{formatDate(todo.due_date)}</span></span>)}
                                {todo.project && (<span>{todo.project.name}</span>)}
                                <TodoRowActions todo={todo} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {overdue.length > 0 && (
                      <div className="mb-8">
                        <h2 className="text-sm font-semibold section-title overdue mb-4">Overdue</h2>
                        <div className="space-y-3">
                          {overdue.map(todo => (
                            <div key={todo.id} className="task-item group flex items-center justify-between py-2">
                              <div className="flex items-center space-x-3">
                                <button onClick={() => toggleTodo(todo.id)} className={`w-5 h-5 border-2 ${getTaskPriorityColor(todo)} rounded-full cursor-pointer hover:bg-opacity-20 transition-colors`}>{todo.completed && (<span className="material-icons text-xs text-center leading-5 text-green-400">check</span>)}</button>
                                <button className="text-left" onClick={() => openEdit(todo)}>
                                  <p className={`${todo.completed ? 'line-through opacity-50' : ''}`}>{todo.text}</p>
                                </button>
                              </div>
                              <div className="flex items-center space-x-4 text-sm task-meta">
                                {todo.due_date && (<span className="flex items-center space-x-1"><span className="material-icons text-sm overdue">calendar_today</span><span>{formatDate(todo.due_date)}</span></span>)}
                                {todo.project && (<span>{todo.project.name}</span>)}
                                <TodoRowActions todo={todo} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </>
                )
              })()}
            </>
          ) : (
            <>
              {/* Existing sections for non-completed views (due today/overdue/active) */}
              {selectedProject !== 'completed' && dueTodayTodos.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-yellow-400 mb-4">Due Today</h2>
                  <div className="space-y-3">
                    {dueTodayTodos.map(todo => (
                      <div key={todo.id} className="task-item group flex items-center justify-between py-2 border-b border-gray-800 hover:bg-gray-800 hover:bg-opacity-30 transition-colors">
                        <div className="flex items-center space-x-3">
                          <button onClick={() => toggleTodo(todo.id)} className={`w-5 h-5 border-2 ${getTaskPriorityColor(todo)} rounded-full cursor-pointer hover:bg-opacity-20 transition-colors`}>{todo.completed && (<span className="material-icons text-xs text-center leading-5 text-green-400">check</span>)}</button>
                          <button className="text-left" onClick={() => openEdit(todo)}>
                            <p className={`${todo.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{todo.text}</p>
                          </button>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          {todo.due_date && (<span className="flex items-center space-x-1"><span className="material-icons text-sm text-gray-400">calendar_today</span><span>{formatDate(todo.due_date)}</span></span>)}
                          {todo.project && (<span>{todo.project.name}</span>)}
                          <TodoRowActions todo={todo} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProject !== 'completed' && overdueTodos.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-red-400 mb-4">Overdue</h2>
                  <div className="space-y-3">
                    {overdueTodos.map(todo => (
                      <div key={todo.id} className="task-item group flex items-center justify-between py-2 border-b border-gray-800 hover:bg-gray-800 hover:bg-opacity-30 transition-colors">
                        <div className="flex items-center space-x-3">
                          <button onClick={() => toggleTodo(todo.id)} className={`w-5 h-5 border-2 ${getTaskPriorityColor(todo)} rounded-full cursor-pointer hover:bg-opacity-20 transition-colors`}>{todo.completed && (<span className="material-icons text-xs text-center leading-5 text-green-400">check</span>)}</button>
                          <button className="text-left" onClick={() => openEdit(todo)}>
                            <p className={`${todo.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{todo.text}</p>
                          </button>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          {todo.due_date && (<span className="flex items-center space-x-1"><span className="material-icons text-sm text-red-400">calendar_today</span><span>{formatDate(todo.due_date)}</span></span>)}
                          {todo.project && (<span>{todo.project.name}</span>)}
                          <TodoRowActions todo={todo} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProject !== 'completed' && activeTodos.length > 0 && (
                <div className="space-y-3">
                  {activeTodos.map(todo => (
                    <div key={todo.id} className="task-item group flex items-center justify-between py-2 border-b border-gray-800 hover:bg-gray-800 hover:bg-opacity-30 transition-colors">
                      <div className="flex items-center space-x-3">
                        <button onClick={() => toggleTodo(todo.id)} className={`w-5 h-5 border-2 ${getTaskPriorityColor(todo)} rounded-full cursor-pointer hover:bg-opacity-20 transition-colors`}>{todo.completed && (<span className="material-icons text-xs text-center leading-5 text-green-400">check</span>)}</button>
                        <button className="text-left" onClick={() => openEdit(todo)}>
                          <p className={`${todo.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{todo.text}</p>
                        </button>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-400">
                        {todo.due_date && (<span className="flex items-center space-x-1"><span className="material-icons text-sm text-gray-400">calendar_today</span><span>{formatDate(todo.due_date)}</span></span>)}
                        {todo.project && (<span>{todo.project.name}</span>)}
                        <TodoRowActions todo={todo} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedProject !== 'completed' && upcomingTodos.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-blue-400 mb-4">Upcoming</h2>
                  <div className="space-y-3">
                    {upcomingTodos.map(todo => (
                      <div key={todo.id} className="task-item group flex items-center justify-between py-2 border-b border-gray-800 hover:bg-gray-800 hover:bg-opacity-30 transition-colors">
                        <div className="flex items-center space-x-3">
                          <button onClick={() => toggleTodo(todo.id)} className={`w-5 h-5 border-2 ${getTaskPriorityColor(todo)} rounded-full cursor-pointer hover:bg-opacity-20 transition-colors`}>{todo.completed && (<span className="material-icons text-xs text-center leading-5 text-green-400">check</span>)}</button>
                          <button className="text-left" onClick={() => openEdit(todo)}>
                            <p className={`${todo.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{todo.text}</p>
                          </button>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          {todo.due_date && (<span className="flex items-center space-x-1"><span className="material-icons text-sm text-blue-400">calendar_today</span><span>{formatDate(todo.due_date)}</span></span>)}
                          {todo.project && (<span>{todo.project.name}</span>)}
                          <TodoRowActions todo={todo} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProject !== 'completed' && somedayTodos.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-gray-400 mb-4">Someday</h2>
                  <div className="space-y-3">
                    {somedayTodos.map(todo => (
                      <div key={todo.id} className="task-item group flex items-center justify-between py-2 border-b border-gray-800 hover:bg-gray-800 hover:bg-opacity-30 transition-colors">
                        <div className="flex items-center space-x-3">
                          <button onClick={() => toggleTodo(todo.id)} className={`w-5 h-5 border-2 ${getTaskPriorityColor(todo)} rounded-full cursor-pointer hover:bg-opacity-20 transition-colors`}>{todo.completed && (<span className="material-icons text-xs text-center leading-5 text-green-400">check</span>)}</button>
                          <button className="text-left" onClick={() => openEdit(todo)}>
                            <p className={`${todo.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{todo.text}</p>
                          </button>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          {todo.project && (<span>{todo.project.name}</span>)}
                          <TodoRowActions todo={todo} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProject === 'completed' && (
                <div className="space-y-3">
                  {todos.map(todo => (
                    <div key={todo.id} className="task-item group flex items-center justify-between py-2 border-b border-gray-800 hover:bg-gray-800 hover:bg-opacity-30 transition-colors opacity-80">
                      <div className="flex items-center space-x-3">
                        <button onClick={() => toggleTodo(todo.id)} className="w-5 h-5 border-2 border-green-400 bg-green-400 rounded-full cursor-pointer hover:bg-green-500 transition-colors flex items-center justify-center"><span className="material-icons text-xs text-white">check</span></button>
                        <button className="text-left" onClick={() => openEdit(todo)}>
                          <p className="line-through text-gray-400">{todo.text}</p>
                        </button>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        {todo.due_date && (<span className="flex items-center space-x-1"><span className="material-icons text-sm text-gray-500">calendar_today</span><span>{formatDate(todo.due_date)}</span></span>)}
                        {todo.project && (<span>{todo.project.name}</span>)}
                        <span className="text-xs">Completed {formatDate(todo.created_at)}</span>
                        <TodoRowActions todo={todo} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {todos.length === 0 && (
            <div className="text-center py-12"><p className="text-gray-500 mb-4">{selectedProject === 'completed' ? 'No completed tasks yet!' : 'No tasks yet!'}</p>{selectedProject !== 'completed' && (<p className="text-gray-400 text-sm">Press <kbd className="px-2 py-1 bg-gray-800 rounded text-xs">Q</kbd> to add your first task</p>)}</div>
          )}
        </div>
      </main>

      {/* Add Task Modal (add mode) */}
      <AddTaskModal isOpen={isAddTaskModalOpen || false} onClose={onCloseAddTaskModal} onAdd={addTodo} selectedProject={typeof selectedProject === 'object' ? selectedProject : null} />

      {/* Edit Task Modal */}
      <AddTaskModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditTask(null) }} onUpdate={updateTodoFields} editTask={editTask} selectedProject={typeof selectedProject === 'object' ? selectedProject : null} />

      {/* Quick Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 search-modal" onClick={() => setIsSearchOpen(false)}>
          <div className="bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setIsSearchOpen(false); return }
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveResultIdx(i => Math.min(i + 1, Math.max(searchResults.length - 1, 0))); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActiveResultIdx(i => Math.max(i - 1, 0)); return }
                if (e.key === 'Enter') { e.preventDefault(); const t = searchResults[activeResultIdx]; if (t) { openEdit(t); setIsSearchOpen(false) } }
              }}
              placeholder="Search tasks..."
              className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-700 outline-none"
            />
            <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-gray-800">
              {searchResults.map((t, idx) => (
                <div key={t.id} className={`py-2 px-2 text-gray-200 flex items-center justify-between ${activeResultIdx === idx ? 'bg-gray-700' : ''}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleTodoFromSearch(t.id)} className={`w-5 h-5 border-2 ${t.completed ? 'border-green-400 bg-green-400' : 'border-blue-400'} rounded-full flex items-center justify-center`}>{t.completed && <span className="material-icons text-xs text-white">check</span>}</button>
                    <span>{t.text}</span>
                  </div>
                  {t.due_date && <span className="text-xs text-gray-400">{new Date(t.due_date).toLocaleDateString()}</span>}
                </div>
              ))}
              {searchQuery && searchResults.length === 0 && (<div className="py-6 text-center text-gray-500">No results</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TodoList
