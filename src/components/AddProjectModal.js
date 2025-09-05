import React, { useState, useEffect, useRef } from 'react'
import { projectService } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const AddProjectModal = ({ isOpen, onClose, onProjectAdded, onProjectUpdated, project = null }) => {
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')
  const [isFavorite, setIsFavorite] = useState(false)
  const [loading, setLoading] = useState(false)
  const modalRef = useRef(null)
  const { user } = useAuth()

  // Initialize form when opened or when project changes (edit mode)
  useEffect(() => {
    if (isOpen) {
      if (project) {
        setName(project.name || '')
        setColor(project.color || 'blue')
        setIsFavorite(!!project.is_favorite)
      } else {
        setName('')
        setColor('blue')
        setIsFavorite(false)
      }
    }
  }, [isOpen, project])

  const handleClose = () => { if (loading) return; onClose() }

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        handleClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen, handleClose])

  const colors = [
    { value: 'blue', label: 'Blue', class: 'text-blue-400' },
    { value: 'green', label: 'Green', class: 'text-green-400' },
    { value: 'yellow', label: 'Yellow', class: 'text-yellow-400' },
    { value: 'red', label: 'Red', class: 'text-red-400' },
    { value: 'purple', label: 'Purple', class: 'text-purple-400' },
    { value: 'indigo', label: 'Indigo', class: 'text-indigo-400' },
    { value: 'pink', label: 'Pink', class: 'text-pink-400' },
    { value: 'gray', label: 'Gray', class: 'text-gray-400' }
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      setLoading(true)
      if (project) {
        await projectService.updateProject(project.id, {
          name: name.trim(),
          color,
          is_favorite: isFavorite
        })
        if (onProjectUpdated) onProjectUpdated()
      } else {
        const created = await projectService.createProject(name.trim(), color, isFavorite, user.id)
        if (onProjectAdded) onProjectAdded(created)
      }
      onClose()
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Failed to save project. Please try again.')
    } finally { setLoading(false) }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md mx-4 border border-gray-800" ref={modalRef}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">{project ? 'Edit Project' : 'Add Project'}</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-200" disabled={loading}>
            <span className="material-icons">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Project Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter project name..."
              className="w-full px-3 py-2 bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Color</label>
            <div className="grid grid-cols-4 gap-2">
              {colors.map((colorOption) => (
                <label key={colorOption.value} className="cursor-pointer">
                  <input type="radio" name="color" value={colorOption.value} checked={color === colorOption.value} onChange={(e) => setColor(e.target.value)} className="sr-only" disabled={loading} />
                  <div className={`flex items-center space-x-2 p-2 rounded border-2 transition-colors ${color === colorOption.value ? 'border-blue-500 bg-gray-800' : 'border-gray-700 hover:border-gray-600'}`}>
                    <span className={`material-icons ${colorOption.class}`}>folder</span>
                    <span className="text-sm text-gray-200">{colorOption.label}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" checked={isFavorite} onChange={(e) => setIsFavorite(e.target.checked)} disabled={loading} className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-blue-500" />
              <span className="text-sm text-gray-300">Add to favorites</span>
            </label>
          </div>

          <div className="flex space-x-3 pt-4">
            <button type="button" onClick={handleClose} disabled={loading} className="flex-1 px-4 py-2 text-gray-200 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={loading || !name.trim()} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? (project ? 'Saving...' : 'Creating...') : (project ? 'Save Changes' : 'Create Project')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddProjectModal
