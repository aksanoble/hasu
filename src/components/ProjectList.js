import React, { useState, useEffect, useCallback } from 'react'
import { projectService, userDataClient, deriveSchemaName } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ThemeToggle from './ThemeToggle'
import AddProjectModal from './AddProjectModal'
import './ProjectList.css'

const Navigation = ({ selectedProjectId, onProjectSelect, onAddProject, onAddTask, mobileOpen = false, onCloseMobile = () => {} }) => {
  const [projects, setProjects] = useState([])
  const [favoriteProjects, setFavoriteProjects] = useState([])
  const [regularProjects, setRegularProjects] = useState([])
  const [todayTaskCount, setTodayTaskCount] = useState(0)
  const [upcomingTaskCount, setUpcomingTaskCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [activeProjectMenu, setActiveProjectMenu] = useState(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { user, signOut } = useAuth()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [projectToEdit, setProjectToEdit] = useState(null)

  // Legacy credential clearing no longer needed - Supakey manages authentication

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const allProjects = await projectService.getProjectsWithCounts()

      setProjects(allProjects)
      setFavoriteProjects(allProjects.filter(p => p.is_favorite))
      setRegularProjects(allProjects.filter(p => !p.is_inbox && !p.is_favorite))
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTodayTaskCount = useCallback(async () => {
    try {
      // Count tasks due today or overdue, relative to local timezone
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfTomorrow = new Date(startOfToday)
      startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

      if (!userDataClient) {
        throw new Error('User data client not initialized. Please authenticate first.')
      }
      const client = userDataClient
      const { count, error } = await client
        .from('hasutodo_todos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', false)
        // due_date < start of tomorrow (i.e., up to end of today), and not null
        .lt('due_date', startOfTomorrow.toISOString())
        .not('due_date', 'is', null)
      if (error) throw error
      setTodayTaskCount(count || 0)
    } catch (error) {
      console.error('Error fetching today task count:', error)
      setTodayTaskCount(0)
    }
  }, [user])

  const fetchUpcomingTaskCount = useCallback(async () => {
    try {
      // Count tasks due strictly after today (from start of tomorrow onward)
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfTomorrow = new Date(startOfToday)
      startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

      if (!userDataClient) {
        throw new Error('User data client not initialized. Please authenticate first.')
      }
      const client = userDataClient
      const { count, error } = await client
        .from('hasutodo_todos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', false)
        .gte('due_date', startOfTomorrow.toISOString())
      if (error) throw error
      setUpcomingTaskCount(count || 0)
    } catch (error) {
      console.error('Error fetching upcoming task count:', error)
      setUpcomingTaskCount(0)
    }
  }, [user])

  const setupRealtimeSubscription = useCallback(() => {
    if (!userDataClient) {
      console.warn('User data client not initialized, skipping realtime subscription')
      return null
    }
    const client = userDataClient

    const applyTodoDeltaToProjects = (delta) => {
      // delta: { project_id, diff } where diff is +1/-1 and only for non-completed tasks
      if (!delta || !delta.project_id || !Number.isFinite(delta.diff)) return
      setProjects(prev => prev.map(p => p.id === delta.project_id ? { ...p, todoCount: Math.max(0, (p.todoCount || 0) + delta.diff) } : p))
    }

    const handleTodoRealtime = (payload) => {
      const { eventType, new: newRec, old: oldRec } = payload
      if (eventType === 'INSERT') {
        if (newRec && newRec.project_id && newRec.completed === false) applyTodoDeltaToProjects({ project_id: newRec.project_id, diff: +1 })
      } else if (eventType === 'DELETE') {
        if (oldRec && oldRec.project_id && oldRec.completed === false) applyTodoDeltaToProjects({ project_id: oldRec.project_id, diff: -1 })
      } else if (eventType === 'UPDATE') {
        // If project changed
        if (oldRec?.project_id !== newRec?.project_id) {
          if (oldRec?.project_id && oldRec.completed === false) applyTodoDeltaToProjects({ project_id: oldRec.project_id, diff: -1 })
          if (newRec?.project_id && newRec.completed === false) applyTodoDeltaToProjects({ project_id: newRec.project_id, diff: +1 })
        } else {
          // Same project: adjust for completed toggle
          if (newRec?.project_id) {
            if (oldRec?.completed === false && newRec?.completed === true) applyTodoDeltaToProjects({ project_id: newRec.project_id, diff: -1 })
            if (oldRec?.completed === true && newRec?.completed === false) applyTodoDeltaToProjects({ project_id: newRec.project_id, diff: +1 })
          }
        }
      }
    }
    const channel = client
      .channel('projects-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: deriveSchemaName(process.env.REACT_APP_HASU_APP_IDENTIFIER || 'github.com/aksanoble/hasu'),
          table: 'hasutodo_projects',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchProjects()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: deriveSchemaName(process.env.REACT_APP_HASU_APP_IDENTIFIER || 'github.com/aksanoble/hasu'),
          table: 'hasutodo_todos',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => { 
          // Apply instantaneous local deltas for project counts
          try { handleTodoRealtime(payload) } catch (e) { console.warn('todo realtime delta error', e) }
          // Also do a background refresh to stay authoritative
          fetchProjects()
          fetchTodayTaskCount()
          fetchUpcomingTaskCount()
        }
      )
      .subscribe()

    return () => {
      userDataClient.removeChannel(channel)
    }
  }, [user, fetchTodayTaskCount, fetchUpcomingTaskCount])

  useEffect(() => {
    if (!user) return
    const cleanup = setupRealtimeSubscription()
    fetchProjects()
    fetchTodayTaskCount()
    fetchUpcomingTaskCount()
    return () => { if (cleanup) cleanup() }
  }, [user, fetchTodayTaskCount, fetchUpcomingTaskCount, setupRealtimeSubscription])

  // All refreshes are driven by realtime + initial fetches; no window events

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isDropdownOpen && !e.target.closest('.admin-dropdown')) {
        setIsDropdownOpen(false)
      }
      if (activeProjectMenu && !e.target.closest('.project-menu')) {
        setActiveProjectMenu(null)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [isDropdownOpen, activeProjectMenu])

  const handleProjectClick = (project) => {
    onProjectSelect(project)
  }

  const handleAddProject = () => {
    if (onAddProject) {
      onAddProject()
    }
  }

  const handleProjectMenuClick = (projectId, e) => {
    e.stopPropagation()
    setActiveProjectMenu(activeProjectMenu === projectId ? null : projectId)
  }

  const handleEditProject = (project) => {
    setProjectToEdit(project)
    setIsEditModalOpen(true)
    setActiveProjectMenu(null)
  }

  const handleDeleteProject = async (project) => {
    try {
      // Prevent deleting inbox project
      if (project.is_inbox) {
        alert('Cannot delete inbox project. Inbox projects are required for each user.')
        setActiveProjectMenu(null)
        return
      }

      // Confirm deletion
      if (!window.confirm(`Are you sure you want to delete "${project.name}"? This will also delete all todos in this project.`)) {
        setActiveProjectMenu(null)
        return
      }

      await projectService.deleteProject(project.id)
      
      // Refresh projects list
      fetchProjects()
      // If the deleted project is currently selected, switch to Today view
      try {
        if (selectedProjectId === project.id) {
          onProjectSelect('today')
        }
      } catch {}
      
      setActiveProjectMenu(null)
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('Error deleting project. Please try again.')
      setActiveProjectMenu(null)
    }
  }

  const getColorClass = (color) => {
    const colorMap = {
      red: 'text-red-500',
      blue: 'text-blue-500',
      green: 'text-green-500',
      yellow: 'text-yellow-500',
      purple: 'text-purple-500',
      pink: 'text-pink-500',
      indigo: 'text-indigo-500',
      gray: 'text-gray-500'
    }
    return colorMap[color] || 'text-gray-500'
  }

  if (loading) {
    return (
      <aside className={`${isCollapsed ? 'w-16' : 'w-64'} sidebar flex-shrink-0 flex flex-col h-screen overflow-hidden transition-all duration-300 ease-in-out`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="mt-2 text-sm">Loading...</p>
          </div>
        </div>
      </aside>
    )
  }

  const inboxProject = projects.find(p => p.is_inbox)
  const favoritesWithCounts = favoriteProjects.map(fav =>
    projects.find(p => p.id === fav.id) || fav
  )
  const regularsWithCounts = regularProjects.map(reg =>
    projects.find(p => p.id === reg.id) || reg
  )

  return (
    <aside className={`sidebar flex-shrink-0 flex flex-col h-screen overflow-hidden transition-transform duration-300 ease-in-out bg-transparent z-40
      fixed inset-y-0 left-0 w-64 transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:static lg:translate-x-0 ${isCollapsed ? 'lg:w-16' : 'lg:w-64'}`}>
      {/* Header Section - Fixed */}
      <div className={`flex-shrink-0 ${isCollapsed ? 'p-2' : 'p-4'} border-b border-gray-800`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <div className="relative admin-dropdown">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-8 h-8 user-avatar rounded-full flex items-center justify-center font-bold text-white transition-colors"
                title="User Menu"
              >
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </button>
              
              {!isCollapsed && isDropdownOpen && (
                <div className="absolute left-0 mt-2 w-48 sidebar-dropdown rounded-md shadow-lg z-50">
                  <div className="py-1">
                    <div className="px-4 py-2 text-sm sidebar-dropdown-header">
                      {user?.email}
                    </div>
                    <ThemeToggle />
                    <button
                      onClick={() => {
                        handleProjectClick('completed')
                        setIsDropdownOpen(false)
                      }}
                      className="w-full text-left px-4 py-2 text-sm sidebar-dropdown-item flex items-center space-x-2"
                    >
                      <span className="material-icons text-sm">check_circle</span>
                      <span>View Completed Tasks</span>
                    </button>
                    <button
                      onClick={() => {
                        signOut()
                        setIsDropdownOpen(false)
                      }}
                      className="w-full text-left px-4 py-2 text-sm sidebar-dropdown-item flex items-center space-x-2"
                    >
                      <span className="material-icons text-sm">logout</span>
                      <span>Sign Out</span>
                    </button>
                    {/* Legacy credential clearing removed - Supakey handles authentication */}
                  </div>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <span className="font-semibold truncate max-w-[10rem]">
                {user?.email?.split('@')[0] || 'User'}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="material-icons text-lg sidebar-icon cursor-pointer"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? 'chevron_right' : 'chevron_left'}
            </button>
            {/* Close on mobile */}
            <button onClick={onCloseMobile} className="material-icons text-lg sidebar-icon cursor-pointer lg:hidden" title="Close menu">close</button>
          </div>
        </div>
      </div>

      {/* Add Task Button - Fixed */}
      <div className="flex-shrink-0 p-4 pb-2">
        <button 
          onClick={onAddTask}
          className={`w-full add-task-button rounded-md py-2 ${isCollapsed ? 'px-2' : 'px-4'} flex items-center justify-center ${isCollapsed ? '' : 'space-x-2'} transition-colors`}
          title="Add task"
        >
          <span className="material-icons">add</span>
          {!isCollapsed && <span>Add task</span>}
        </button>
      </div>

      {/* Navigation - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <nav className="flex flex-col space-y-2 p-4 pt-2">
          <button 
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} sidebar-button p-2 rounded-md text-left`}
            onClick={() => { onProjectSelect(null); window.dispatchEvent(new Event('open-search-modal')) }}
            title="Search"
          >
            <span className="material-icons text-lg">search</span>
            {!isCollapsed && <span>Search</span>}
          </button>
          
          {/* Inbox */}
          {inboxProject && (
            <button
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} sidebar-button p-2 rounded-md text-left ${
                selectedProjectId === inboxProject.id ? 'active' : ''
              }`}
              onClick={() => handleProjectClick(inboxProject)}
              title="Inbox"
            >
              <div className={`flex items-center ${isCollapsed ? '' : 'space-x-3'}`}>
                <span className="material-icons text-lg">inbox</span>
                {!isCollapsed && <span>Inbox</span>}
              </div>
              {!isCollapsed && inboxProject.todoCount > 0 && (
                <span className="text-xs project-count">{inboxProject.todoCount}</span>
              )}
            </button>
          )}
          
          <button 
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} sidebar-button p-2 rounded-md text-left ${
              selectedProjectId === 'today' ? 'active' : ''
            }`}
            onClick={() => handleProjectClick('today')}
            title="Today"
          >
            <div className={`flex items-center ${isCollapsed ? '' : 'space-x-3'}`}>
              <span className="material-icons text-lg">today</span>
              {!isCollapsed && <span>Today</span>}
            </div>
            {!isCollapsed && (
              <span className="text-xs project-count">
                {todayTaskCount}
              </span>
            )}
          </button>
          
          <button 
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} sidebar-button p-2 rounded-md text-left ${
              selectedProjectId === 'upcoming' ? 'active' : ''
            }`}
            onClick={() => handleProjectClick('upcoming')}
            title="Upcoming"
          >
            <div className={`flex items-center ${isCollapsed ? '' : 'space-x-3'}`}>
              <span className="material-icons text-lg">event</span>
              {!isCollapsed && <span>Upcoming</span>}
            </div>
            {!isCollapsed && (
              <span className="text-xs project-count">
                {upcomingTaskCount}
              </span>
            )}
          </button>
          
        </nav>

        {/* Favorites Section */}
        {!isCollapsed && favoritesWithCounts.length > 0 && (
          <div className="px-4">
            <h3 className="project-count text-sm font-semibold uppercase tracking-wider mb-2">Favorites</h3>
            <ul className="space-y-1">
              {favoritesWithCounts.map(project => (
                <li key={project.id} className="group relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleProjectClick(project) } }}
                    className={`w-full cursor-pointer flex items-center justify-between sidebar-button p-2 rounded-md text-left ${
                      selectedProjectId === project.id ? 'active' : ''
                    }`}
                    onClick={() => handleProjectClick(project)}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-red-500">#</span>
                      <span>{project.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs ${selectedProjectId === project.id ? 'font-semibold' : 'project-count'}`}>
                        {project.todoCount || 0}
                      </span>
                      <div className="relative project-menu">
                        <button
                          onClick={(e) => handleProjectMenuClick(project.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-opacity-20 rounded transition-opacity"
                        >
                          <span className="material-icons text-sm opacity-70">more_vert</span>
                        </button>
                        
                        {activeProjectMenu === project.id && (
                          <div className="absolute right-0 top-8 w-36 task-dropdown rounded-md shadow-lg z-50">
                            <div className="py-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditProject(project) }}
                                className="w-full text-left px-3 py-2 text-sm sidebar-dropdown-item flex items-center space-x-2"
                              >
                                <span className="material-icons text-sm">edit</span>
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteProject(project) }}
                                className="w-full text-left px-3 py-2 text-sm delete flex items-center space-x-2"
                              >
                                <span className="material-icons text-sm">delete</span>
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* My Projects Section */}
        {!isCollapsed && (
          <div className="px-4 mt-4">
            <h3 className="project-count text-sm font-semibold uppercase tracking-wider mb-2">My Projects</h3>
            <ul className="space-y-1">
              {regularsWithCounts.map(project => (
                <li key={project.id} className="group relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleProjectClick(project) } }}
                    className={`w-full cursor-pointer flex items-center justify-between sidebar-button p-2 rounded-md text-left ${
                      selectedProjectId === project.id ? 'active' : ''
                    }`}
                    onClick={() => handleProjectClick(project)}
                  >
                    <div className="flex items-center space-x-3">
                      <span className={`material-icons text-lg ${getColorClass(project.color)}`}>
                        folder
                      </span>
                      <span>{project.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs project-count">{project.todoCount || 0}</span>
                      <div className="relative project-menu">
                        <button
                          onClick={(e) => handleProjectMenuClick(project.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-opacity-20 rounded transition-opacity"
                        >
                          <span className="material-icons text-sm opacity-70">more_vert</span>
                        </button>
                        
                        {activeProjectMenu === project.id && (
                          <div className="absolute right-0 top-8 w-36 task-dropdown rounded-md shadow-lg z-50">
                            <div className="py-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditProject(project) }}
                                className="w-full text-left px-3 py-2 text-sm sidebar-dropdown-item flex items-center space-x-2"
                              >
                                <span className="material-icons text-sm">edit</span>
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteProject(project) }}
                                className="w-full text-left px-3 py-2 text-sm delete flex items-center space-x-2"
                              >
                                <span className="material-icons text-sm">delete</span>
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              
              {/* Add Project Button */}
              <li>
                <button
                  onClick={handleAddProject}
                  className="w-full flex items-center space-x-3 sidebar-button p-2 rounded-md text-left"
                >
                  <span className="material-icons text-lg">add</span>
                  <span>Add project</span>
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Edit Project Modal (reuse AddProjectModal for edit) */}
      <AddProjectModal
        isOpen={isEditModalOpen}
        project={projectToEdit}
        onClose={() => { setIsEditModalOpen(false); setProjectToEdit(null) }}
        onProjectUpdated={() => { fetchProjects() }}
      />
    </aside>
  )
}

export default Navigation
