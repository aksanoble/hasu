import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { projectService, todoService, userDataClient } from '../lib/supabase'
import AddTaskModal from './AddTaskModal'

const invoke = (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
  ? window.__TAURI__.core.invoke
  : () => Promise.resolve()

const QuickAdd = () => {
  const { user, loading } = useAuth()
  const [isOpen, setIsOpen] = useState(true)
  const [defaultProject, setDefaultProject] = useState(null)
  const containerRef = useRef(null)

  const handleClose = useCallback(async () => {
    setIsOpen(false)
    await closeWindow()
  }, [])

  // Handle click outside to close window
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Only close if clicking on the background overlay, not the modal content
      if (event.target === event.currentTarget) {
        handleClose()
      }
    }

    if (isOpen) {
      // Use a small delay to prevent immediate closing when window opens
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 100)
      
      return () => {
        clearTimeout(timer)
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen, handleClose])

  useEffect(() => {
    if (!user) return
    
    // Small delay to ensure session is fully restored
    const timer = setTimeout(async () => {
      try {
        const inbox = await projectService.getInboxProject?.()
        setDefaultProject(inbox || null)
      } catch (error) {
        setDefaultProject(null)
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [user, loading])

  const closeWindow = async () => {
    try { await invoke('close_quick_add_window') } catch {}
  }


  const handleAdd = async (text, dueDate = null, projectId = null) => {
    if (!user) {
      return false
    }
    
    // Test user data client connection first
    try {
      if (!userDataClient) {
        return false
      }
    } catch (error) {
      return false
    }
    
    try {
      await todoService.createTodo(text, projectId, dueDate, user.id)
      return true
    } catch (error) {
      return false
    }
  }

  if (loading) {
    return (
      <div className="h-screen bg-black bg-opacity-50 flex items-center justify-center">
        <div className="text-center space-y-3 text-white">
          <div>Loading...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-screen bg-black bg-opacity-50 flex items-center justify-center">
        <div className="text-center space-y-3 text-white">
          <div>Please open the main app and sign in to use Quick Add.</div>
          <button onClick={closeWindow} className="submit-button px-4 py-2 rounded">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-black bg-opacity-50 flex items-center justify-center" ref={containerRef} onClick={handleClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <AddTaskModal
          isOpen={isOpen}
          onClose={handleClose}
          onAdd={handleAdd}
          selectedProject={defaultProject}
        />
      </div>
    </div>
  )
}

export default QuickAdd
