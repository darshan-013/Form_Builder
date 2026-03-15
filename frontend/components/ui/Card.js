import React from 'react';

export default function Card({ children, className = '', glass = true, ...props }) {
  const baseStyles = "bg-white dark:bg-slate-900/60 transition-all duration-200 border border-gray-200 dark:border-white/10 rounded-xl shadow-sm dark:shadow-lg";
  const glassStyles = glass ? "backdrop-blur-xl" : "";
  
  return (
    <div 
      className={`${baseStyles} ${glassStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
