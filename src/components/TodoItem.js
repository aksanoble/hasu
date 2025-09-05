import React, { useState } from 'react'

const TodoItem = ({ todo, onToggle, onDelete, onUpdateDueDate, onEdit }) => {
  const [isEditingDate, setIsEditingDate] = useState(false)
  const [editDate, setEditDate] = useState(todo.due_date || '')

  const handleDateSave = () => {
    onUpdateDueDate(todo.id, editDate || null)
    setIsEditingDate(false)
  }

  const handleDateCancel = () => {
    setEditDate(todo.due_date || '')
    setIsEditingDate(false)
  }

  const isOverdue = () => {
    if (!todo.due_date || todo.completed) return false
    // Compare using local midnight boundaries
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const due = new Date(todo.due_date)
    const dueLocal = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    return dueLocal < startOfToday
  }

  const isDueToday = () => {
    if (!todo.due_date || todo.completed) return false
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const due = new Date(todo.due_date)
    const dueLocal = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    return dueLocal.getTime() === startOfToday.getTime()
  }

  return (
    <div className="flex items-center py-2 px-3 hover:bg-gray-50 rounded-md group">
      <div className="flex items-center mr-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          className="w-5 h-5 rounded-full border-2 border-orange-400 text-orange-400 focus:ring-orange-400 focus:ring-2 appearance-none checked:bg-orange-400 checked:border-orange-400 relative checked:after:content-['✓'] checked:after:text-white checked:after:text-xs checked:after:absolute checked:after:top-0 checked:after:left-0 checked:after:w-full checked:after:h-full checked:after:flex checked:after:items-center checked:after:justify-center"
        />
      </div>
      {/* Clickable content area to trigger edit */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit && onEdit(todo)}>
        <span className={`block ${todo.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
          {todo.text}
        </span>
        {/* Due date display / inline editor */}
        {isEditingDate ? (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
              autoFocus
            />
            <button
              onClick={handleDateSave}
              className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Save
            </button>
            <button
              onClick={handleDateCancel}
              className="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          todo.due_date && (
            <div className="mt-1 text-xs text-gray-600">
              {isDueToday() ? 'Today' : isOverdue() ? 'Overdue' : new Date(todo.due_date).toLocaleDateString()}
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default TodoItem
