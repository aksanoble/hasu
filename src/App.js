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
        <div className="force-light min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {/* Simple header with links */}
          <header className="bg-white/90 backdrop-blur border-b sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
              <a href="/" className="text-xl font-semibold text-gray-900">Hasu</a>
              <nav className="flex items-center gap-4 text-sm text-gray-600">
                <a className="hover:text-gray-900" href="/how-it-works.html">How it works</a>
                <a className="inline-flex items-center hover:text-gray-900" href="https://github.com/aksanoble/hasu" target="_blank" rel="noopener" aria-label="GitHub">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="block"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.563 21.8 24 17.302 24 12 24 5.373 18.627 0 12 0z"/></svg>
                </a>
                <a className="inline-flex items-center hover:text-gray-900" href="https://x.com/aksanoble" target="_blank" rel="noopener" aria-label="X (Twitter)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="block"><path d="M4 4l16 16M20 4L4 20"/></svg>
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1 flex items-center">
            <div className="w-full py-10 px-4 sm:px-6 lg:px-8">
              <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-10 gap-10 items-center">
                <section className="lg:col-span-7"><SliderCard /></section>
                <section className="lg:col-span-3"><Auth embedded /></section>
              </div>
            </div>
          </main>
          <footer className="py-8 text-center text-sm text-gray-500">© Hasu •
            <a href="mailto:akshay@kanthi.io" aria-label="Email" className="inline-flex items-center justify-center align-middle text-gray-500 hover:text-gray-700 ml-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="block">
                <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 2v.01L12 13 4 6.01V6h16zM4 18V8.236l8 6.4 8-6.4V18H4z"/>
              </svg>
            </a>
          </footer>
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
