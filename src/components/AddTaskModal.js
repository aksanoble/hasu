import React, { useState, useEffect, useRef, useCallback } from 'react'
import { projectService } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import './AddTaskModal.css'

// Helper: local YYYY-MM-DD (no UTC offset)
const toLocalISODate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const AddTaskModal = ({ isOpen, onClose, onAdd, onUpdate, editTask = null, selectedProject = null }) => {
  const [taskText, setTaskText] = useState('')
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(selectedProject?.id || null)
  const selectedProjectIdRef = useRef(selectedProject?.id || null)
  const setProjectId = (id) => { selectedProjectIdRef.current = id; setSelectedProjectId(id) }
  const [selectedDate, setSelectedDate] = useState('no-date')
  const [priority, setPriority] = useState(null)
  const [customDate, setCustomDate] = useState('')
  const [showDatePanel, setShowDatePanel] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Inline project suggestions
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [filteredProjects, setFilteredProjects] = useState([])
  const [activeProjIdx, setActiveProjIdx] = useState(0)

  const [showBottomProjectDropdown, setShowBottomProjectDropdown] = useState(false)

  const textareaRef = useRef(null)
  const modalRef = useRef(null)
  const { user } = useAuth()

  const fetchProjects = useCallback(async () => {
    try {
      const allProjects = await projectService.getProjects()
      setProjects(allProjects)
      setFilteredProjects(allProjects)
      
      // Set inbox as default project if no project is selected - only on initial load
      if (!selectedProjectIdRef.current && !selectedProject && allProjects.length > 0) {
        const inboxProject = allProjects.find(p => p.is_inbox)
        if (inboxProject) {
          setProjectId(inboxProject.id)
        }
      }
    } catch (error) { console.error('Error fetching projects:', error) }
  }, []) // Remove dependencies to prevent re-running when selectedProject changes

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        // Click outside modal - close everything
        setShowProjectDropdown(false)
        setShowBottomProjectDropdown(false)
        setShowDatePanel(false)
      } else if (modalRef.current && modalRef.current.contains(event.target)) {
        // Click inside modal - check if it's outside dropdowns
        const target = event.target
        
        // Check if click is outside inline project dropdown
        const inlineDropdown = modalRef.current.querySelector('.project-dropdown')
        if (showProjectDropdown && inlineDropdown && !inlineDropdown.contains(target)) {
          setShowProjectDropdown(false)
        }
        
        // Check if click is outside bottom project dropdown
        const bottomDropdown = modalRef.current.querySelector('.bottom-project-dropdown')
        if (showBottomProjectDropdown && bottomDropdown && !bottomDropdown.contains(target)) {
          setShowBottomProjectDropdown(false)
        }
        
        // Check if click is outside date panel
        const datePanel = modalRef.current.querySelector('.date-panel')
        if (showDatePanel && datePanel && !datePanel.contains(target)) {
          setShowDatePanel(false)
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen, showProjectDropdown, showBottomProjectDropdown, showDatePanel])

  useEffect(() => {
    if (isOpen && user) {
      fetchProjects()
      setTimeout(() => { textareaRef.current?.focus() }, 50)
    }
  }, [isOpen, user, fetchProjects])

  // Reset form only when modal first opens (not when selectedProject changes)
  useEffect(() => {
    if (isOpen && !editTask) {
      resetForm()
    }
  }, [isOpen]) // Only depend on isOpen, not selectedProject

  useEffect(() => {
    if (selectedProject) {
      setProjectId(selectedProject.id)
    }
  }, [selectedProject?.id])


  useEffect(() => {
    if (editTask) {
      setTaskText(editTask.text || '')
      setProjectId(editTask.project_id || selectedProject?.id || null)
      if (editTask.due_date) { setSelectedDate('custom'); setCustomDate(editTask.due_date) } else { setSelectedDate('no-date'); setCustomDate('') }
    }
  }, [editTask])

  const resetForm = () => {
    setTaskText('')
    setSelectedDate('no-date')
    setPriority(null)
    setCustomDate('')
    setShowProjectDropdown(false)
    setShowBottomProjectDropdown(false)
    setShowDatePanel(false)
    setSubmitting(false)
    setErrorMsg('')
  }

  const handleTextChange = (e) => {
    const value = e.target.value
    setTaskText(value)
    // Detect inline #project query
    const cursorPosition = e.target.selectionStart
    const textBeforeCursor = value.substring(0, cursorPosition)
    const lastHashIndex = textBeforeCursor.lastIndexOf('#')
    if (lastHashIndex !== -1) {
      const query = textBeforeCursor.substring(lastHashIndex + 1)
      if (/^\w{0,30}$/.test(query)) {
        filterProjects(query)
        showProjectDropdownNearCursor(cursorPosition)
        setActiveProjIdx(0)
      } else {
        setShowProjectDropdown(false)
      }
    } else {
      setShowProjectDropdown(false)
    }
    // Date keywords
    recognizeDateKeywords(value)
  }

  const recognizeDateKeywords = (text) => {
    const lower = text.toLowerCase()
    const today = new Date()
    const setCustomFromDate = (d) => { const iso = toLocalISODate(d); setSelectedDate('custom'); setCustomDate(iso) }
    if (/\btod\b/.test(lower) || /\btoday\b/.test(lower)) { setSelectedDate('today'); return }
    if (/\btom\b/.test(lower) || /\btomorrow\b/.test(lower)) { setSelectedDate('tomorrow'); return }
    const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    const tokens = lower.match(/\b[a-z]{3,9}\b/g) || []
    for (const tok of tokens) {
      let idx = weekdays.indexOf(tok)
      if (idx === -1) { const map = {sun:0, mon:1, tue:2, tues:2, wed:3, thu:4, thur:4, thurs:4, fri:5, sat:6}; idx = map[tok] }
      if (typeof idx === 'number' && idx >= 0) {
        const d = new Date(today)
        const delta = (idx - d.getDay() + 7) % 7
        d.setDate(d.getDate() + (delta === 0 ? 7 : delta))
        setCustomFromDate(d)
        return
      }
    }
  }

  const filterProjects = (query) => {
    const q = query.toLowerCase()
    const filtered = projects.filter(project => project.name.toLowerCase().includes(q))
    setFilteredProjects(filtered)
  }

  const showProjectDropdownNearCursor = () => {
    setShowProjectDropdown(true)
  }

  const selectProjectFromDropdown = (project) => {
    // Remove the #query from text and set selected project
    const el = textareaRef.current
    if (!el) return
    const cursorPosition = el.selectionStart
    const before = taskText.substring(0, cursorPosition)
    const lastHashIndex = before.lastIndexOf('#')
    if (lastHashIndex !== -1) {
      const after = taskText.substring(cursorPosition)
      const newText = before.substring(0, lastHashIndex) + after
      setTaskText(newText.trimStart())
      // Move caret to position after removal
      setTimeout(() => { el.setSelectionRange(lastHashIndex, lastHashIndex); el.focus() }, 0)
    }
    setProjectId(project.id)
    setShowProjectDropdown(false)
  }

  const handleInputKeyDown = (e) => {
    if (showProjectDropdown) {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        if (filteredProjects.length > 0) selectProjectFromDropdown(filteredProjects[activeProjIdx] || filteredProjects[0])
        return
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveProjIdx(i => Math.min(i + 1, Math.max(filteredProjects.length - 1, 0))); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveProjIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Escape') { setShowProjectDropdown(false); return }
    }
    handleKeyDown(e)
  }

  const getCurrentProject = () => projects.find(p => p.id === selectedProjectId) || projects.find(p => p.is_inbox) || { name: 'Inbox', id: null }


  const getDateValue = () => {
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7)
    switch (selectedDate) {
      case 'today': return toLocalISODate(today)
      case 'tomorrow': return toLocalISODate(tomorrow)
      case 'next-week': return toLocalISODate(nextWeek)
      case 'custom': return customDate || null
      default: return null
    }
  }

  const stripTags = (text) => {
    // Remove #project tokens and date keywords from saved text
    let t = text.replace(/(^|\s)#\w+/g, '$1').replace(/\s+/g, ' ').trim()
    t = t.replace(/\b(tod|today|tom|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/gi, '')
    t = t.replace(/\s+/g, ' ').trim()
    return t
  }

  const handleSubmit = async () => {
    if (!taskText.trim() || submitting) return
    setErrorMsg('')
    const cleanText = stripTags(taskText)
    const dueDate = getDateValue()
    try {
      setSubmitting(true)
      if (editTask && onUpdate) {
        await onUpdate({ id: editTask.id, text: cleanText, due_date: dueDate, project_id: selectedProjectIdRef.current })
        onClose()
      } else {
        const result = await onAdd(cleanText, dueDate, selectedProjectIdRef.current)
        if (result === false) {
          setErrorMsg('Failed to add task. Please try again.')
        } else {
          onClose()
        }
      }
    } catch (e) {
      console.error('Error submitting task:', e)
      setErrorMsg('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit()
    else if (e.key === 'Escape') onClose()
  }

  // chips removed; no overlay renderer needed

  if (!isOpen) return null

  const isEditing = !!editTask

  return (
    <div className="fixed inset-0 modal-overlay flex items-center justify-center z-50">
      <div className="modal-container rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 relative" ref={modalRef}>
        <h2 className="modal-title text-lg font-semibold mb-3">{isEditing ? 'Edit task' : 'Add task'}</h2>
        <div className="mb-6">
          <textarea
            ref={textareaRef}
            value={taskText}
            onChange={handleTextChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Task name"
            className="w-full modal-textarea text-xl font-bold resize-y min-h-[3rem]"
            rows={3}
            style={{ caretColor: '#f59e0b' }}
            aria-label="Task name input"
            disabled={submitting}
          />
          {errorMsg && (
            <div className="mt-2 text-sm" style={{ color: 'var(--danger-color)' }}>{errorMsg}</div>
          )}
          {/* Recognized date hint */}
          <div className="mt-2 text-sm">
            {selectedDate === 'today' && <span className="date-hint">Recognized: Today</span>}
            {selectedDate === 'tomorrow' && <span className="date-hint">Recognized: Tomorrow</span>}
            {selectedDate === 'custom' && customDate && <span className="date-hint">Recognized: {new Date(customDate).toLocaleDateString()}</span>}
          </div>
          {/* Inline project suggestions */}
          {showProjectDropdown && (
            <div className="absolute z-50 mt-2 w-full max-w-sm project-dropdown rounded-md shadow-xl">
              {filteredProjects.length === 0 && (
                <div className="px-3 py-2 text-sm project-dropdown-help">No matches</div>
              )}
              {filteredProjects.slice(0,6).map((project, idx) => (
                <button
                  key={project.id}
                  onMouseDown={(e) => { e.preventDefault(); selectProjectFromDropdown(project) }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 project-dropdown-item ${activeProjIdx === idx ? 'active' : ''}`}
                >
                  <span className="text-red-500">#</span>
                  <span>{project.name}</span>
                </button>
              ))}
              <div className="px-3 py-1 text-xs project-dropdown-help">Use ↑/↓ to navigate, Tab/Enter to select</div>
            </div>
          )}
          {/* Show selected project tag near input */}
          <div className="mt-2 flex items-center gap-2">
            {selectedProjectId && (
              <span className="project-tag text-xs flex items-center gap-1">
                <span className="hash">#</span>
                <span>{getCurrentProject().name}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2 mb-6">
          <div className="relative">
            <div className="relative inline-flex items-center">
              <button onClick={() => setShowDatePanel(v => !v)} className="px-3 py-1 rounded-md text-sm date-button" disabled={submitting}>{(() => {
                if (selectedDate === 'today') return 'Today'
                if (selectedDate === 'tomorrow') return 'Tomorrow'
                if (selectedDate === 'next-week') return 'Next week'
                if (selectedDate === 'custom' && customDate) {
                  const d = new Date(customDate)
                  const today = new Date(); today.setHours(0,0,0,0)
                  const within7 = (d - today) / (1000*60*60*24)
                  if (within7 >= 1 && within7 <= 7) {
                    return d.toLocaleDateString('en-US', { weekday: 'long' })
                  }
                  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                }
                return 'Date'
              })()}</button>
              {selectedDate !== 'no-date' && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setSelectedDate('no-date'); 
                    setCustomDate(''); 
                    setShowDatePanel(false); 
                  }} 
                  className="ml-1 p-0.5 rounded-full hover:bg-gray-600 hover:bg-opacity-50 transition-colors"
                  disabled={submitting}
                  title="Remove date"
                >
                  <span className="material-icons text-xs">close</span>
                </button>
              )}
            </div>
            {showDatePanel && (
              <div className="absolute z-50 mt-2 w-72 date-panel rounded-md p-3 shadow-xl">
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => { setSelectedDate('today'); setShowDatePanel(false) }} className="px-2 py-1 rounded text-sm date-panel-button">Today</button>
                  <button onClick={() => { setSelectedDate('tomorrow'); setShowDatePanel(false) }} className="px-2 py-1 rounded text-sm date-panel-button">Tomorrow</button>
                  <button onClick={() => { setSelectedDate('next-week'); setShowDatePanel(false) }} className="px-2 py-1 rounded text-sm date-panel-button">Next week</button>
                </div>
                <input type="date" value={selectedDate === 'custom' ? customDate : ''} onChange={(e) => { setSelectedDate('custom'); setCustomDate(e.target.value) }} className="w-full text-sm px-2 py-2 rounded date-input" />
              </div>
            )}
          </div>
          {priority && (<div className="flex items-center priority-tag"><span className="material-icons flag-icon mr-2 text-base">flag</span><span>{priority}</span><button onClick={() => setPriority(null)} className="material-icons ml-2 close-button cursor-pointer text-base">close</button></div>)}
        </div>
        <div className="modal-footer pt-4 flex justify-between items-center">
          <div className="relative">
            <button onClick={() => setShowBottomProjectDropdown(!showBottomProjectDropdown)} className="flex items-center text-sm px-2 py-1 rounded project-selector" disabled={submitting}>
              <span className="hash mr-2">#</span>
              <span>{getCurrentProject().name}</span>
              <span className="material-icons arrow">arrow_drop_down</span>
            </button>
            {showBottomProjectDropdown && (
              <div className="absolute bottom-full left-0 mb-2 bottom-project-dropdown rounded-md shadow-lg z-50 max-h-40 overflow-y-auto min-w-48">
                {projects.map(project => (
                  <button key={project.id} onMouseDown={(e) => { e.preventDefault(); setProjectId(project.id); setShowBottomProjectDropdown(false) }} className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 bottom-project-item ${project.id === selectedProjectId ? 'active' : ''}`}>
                    <span className="text-red-500">#</span>
                    <span>{project.name}</span>
                    {project.is_inbox && <span className="text-xs inbox-label">(Inbox)</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <button onClick={onClose} className="cancel-button font-bold py-2 px-4 rounded-md" disabled={submitting}>Cancel</button>
            <button onClick={handleSubmit} disabled={!taskText.trim() || submitting} className="submit-button font-bold py-2 px-4 rounded-md">{submitting ? 'Adding…' : (isEditing ? 'Save' : 'Add task')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AddTaskModal
