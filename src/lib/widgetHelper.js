/**
 * Updates the Android widget with current todos and auth status
 * @param {Array} todos - Array of todo objects
 * @param {boolean} isLoggedIn - Whether user is logged in
 */
export async function updateAndroidWidget(todos, isLoggedIn) {
  try {
    if (typeof window !== 'undefined' && window.__TAURI__) {
      const { invoke } = await import('@tauri-apps/api/core');

      const widgetTodos = todos.map((todo) => ({
        id: Number(todo.id) || Math.abs(String(todo.text || '').hashCode?.() || 0),
        text: todo.text || todo.task || '',
        completed: !!todo.completed,
        created_at: todo.created_at || todo.createdAt || new Date().toISOString(),
        due_date: todo.due_date || null,
      }));

      const todosJson = JSON.stringify(widgetTodos);
      await invoke('update_widget', { todosJson, isLoggedIn });
    }
  } catch (error) {
    console.error('Failed to update widget:', error);
  }
}

/**
 * Clear the widget (sets to blank state)
 */
export async function clearAndroidWidget() {
  try {
    await updateAndroidWidget([], false);
  } catch (error) {
    console.error('Failed to clear widget:', error);
  }
}

/**
 * Manual test function for widget updates
 * Can be called from browser console: window.testWidgetUpdate()
 */
export async function testWidgetUpdate() {
  const now = Date.now();
  const testTodos = [
    { id: 1, text: "Task A", completed: false, created_at: new Date(now).toISOString() },
    { id: 2, text: "Task B", completed: true, created_at: new Date(now - 1000).toISOString() },
    { id: 3, text: "Task C", completed: false, created_at: new Date(now - 2000).toISOString() }
  ];
  
  await updateAndroidWidget(testTodos, true);
}

// Make test function available globally for debugging
if (typeof window !== 'undefined') {
  window.testWidgetUpdate = testWidgetUpdate;
  window.updateAndroidWidget = updateAndroidWidget;
}

// Polyfill simple hashCode for strings if not present
/* eslint no-extend-native: 0 */
if (typeof String.prototype.hashCode !== 'function') {
  // eslint-disable-next-line no-extend-native
  String.prototype.hashCode = function () {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
      hash = (hash << 5) - hash + this.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  };
}