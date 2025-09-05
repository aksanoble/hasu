import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = () => {
  const { theme, changeTheme } = useTheme();

  const themes = [
    { value: 'system', label: 'System', icon: 'brightness_auto' },
    { value: 'light', label: 'Light', icon: 'light_mode' },
    { value: 'dark', label: 'Dark', icon: 'dark_mode' }
  ];

  return (
    <div className="theme-toggle">
      <div className="px-4 py-2 text-sm sidebar-dropdown-header">
        Theme
      </div>
      {themes.map((themeOption) => (
        <button
          key={themeOption.value}
          onClick={() => changeTheme(themeOption.value)}
          className={`w-full text-left px-4 py-2 text-sm sidebar-dropdown-item flex items-center space-x-2 ${
            theme === themeOption.value ? 'active' : ''
          }`}
        >
          <span className="material-icons text-sm">{themeOption.icon}</span>
          <span>{themeOption.label}</span>
          {theme === themeOption.value && (
            <span className="material-icons text-sm ml-auto">check</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default ThemeToggle;
