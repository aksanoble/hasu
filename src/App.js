import './App.css';
import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import TodoList from './components/TodoList';
import Navigation from './components/ProjectList';
import AddProjectModal from './components/AddProjectModal';
import Auth from './components/Auth';
import SliderCard from './components/SliderCard';

function AppContent() {
  const { user, loading, loadingMessage } = useAuth();
  const [selectedProject, setSelectedProject] = useState('today');
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Add keyboard event listener for 'q' key to open add task modal
  useEffect(() => {
    const handleKeyPress = (event) => {
      // Only trigger if user is logged in and not in an input field
      if (user && event.key === 'q' && !event.target.matches('input, textarea, [contenteditable]')) {
        event.preventDefault();
        setIsAddTaskModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [user]);

  if (loading) {
    return <div className="loading">{loadingMessage || 'Loading...'}</div>;
  }

  const handleProjectSelect = (project) => {
    setSelectedProject(project);
    // Keep add task modal open if it was open during project switch
    // This prevents losing the modal state when switching projects
  };

  const handleAddProject = () => {
    setIsAddProjectModalOpen(true);
  };

  const handleAddTask = () => {
    setIsAddTaskModalOpen(true);
  };

  const handleProjectAdded = (newProject) => {
    // Optionally select the newly created project
    setSelectedProject(newProject);
  };

  const handleTodoAdded = () => {
    // Handle todo added if needed for project counts refresh
    // This could trigger a refresh of project counts
  };

  return (
    <div className="App">
      {loadingMessage && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999,
          background: '#1f2937', color: '#e5e7eb',
          border: '1px solid #374151', borderRadius: 8,
          padding: '8px 12px', boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 14
        }}>
          <span className="material-icons" style={{ fontSize: 16, color: '#93c5fd' }}>autorenew</span>
          <span>{loadingMessage}</span>
        </div>
      )}
      {user ? (
        <div className="flex h-screen overflow-hidden">
          {/* Mobile overlay */}
          {mobileNavOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-40 z-30 lg:hidden" onClick={() => setMobileNavOpen(false)} />
          )}
          <Navigation 
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
            selectedProjectId={typeof selectedProject === 'string' ? selectedProject : selectedProject?.id}
            onProjectSelect={handleProjectSelect}
            onAddProject={handleAddProject}
            onAddTask={handleAddTask}
          />
          <div className="flex-1 overflow-hidden min-h-0">
            <TodoList 
              onOpenSidebar={() => setMobileNavOpen(true)}
              selectedProject={selectedProject}
              onAddTodo={handleTodoAdded}
              isAddTaskModalOpen={isAddTaskModalOpen}
              onCloseAddTaskModal={() => setIsAddTaskModalOpen(false)}
            />
          </div>
          <AddProjectModal
            isOpen={isAddProjectModalOpen}
            onClose={() => setIsAddProjectModalOpen(false)}
            onProjectAdded={handleProjectAdded}
          />
        </div>
      ) : (
        <div className="force-light min-h-screen flex items-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="w-full py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-10 gap-10 items-center">
              <section className="lg:col-span-7"><SliderCard /></section>
              <section className="lg:col-span-3"><Auth embedded /></section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
