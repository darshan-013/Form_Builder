import React from 'react';

export default function Input({ label, error, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-4 py-2 text-sm transition-all duration-200
          bg-white dark:bg-white/5 border rounded-lg outline-none
          ${error 
            ? 'border-red-500 focus:ring-2 focus:ring-red-500/20' 
            : 'border-gray-200 dark:border-white/10 focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
          }
          text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
        `}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-500 font-medium">{error}</span>
      )}
    </div>
  );
}
