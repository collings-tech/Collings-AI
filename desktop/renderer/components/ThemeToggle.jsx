import React from 'react';
import useAppStore from '../store/appStore';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useAppStore();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative flex items-center w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none border ${
        isDark
          ? 'bg-brand-900/60 border-brand-700/40'
          : 'bg-gray-200 border-gray-300'
      }`}
    >
      {/* Sun icon */}
      <svg
        className={`absolute left-1.5 w-4 h-4 transition-opacity duration-200 ${isDark ? 'opacity-30' : 'opacity-100 text-amber-500'}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>

      {/* Moon icon */}
      <svg
        className={`absolute right-1.5 w-4 h-4 transition-opacity duration-200 ${isDark ? 'opacity-100 text-brand-300' : 'opacity-30'}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>

      {/* Thumb */}
      <span
        className={`absolute w-5 h-5 rounded-full shadow-md transition-all duration-300 ${
          isDark
            ? 'translate-x-7 bg-brand-400'
            : 'translate-x-1 bg-white'
        }`}
      />
    </button>
  );
}
