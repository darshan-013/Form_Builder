import React from 'react';

export default function Spinner({ className = '', size = 'md' }) {
  const sizes = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-10 h-10 border-3",
  };
  
  return (
    <div className={`
      inline-block rounded-full border-t-indigo-500 border-r-indigo-500/30 
      border-b-indigo-500/10 border-l-indigo-500/5 
      animate-spin ${sizes[size]} ${className}
    `} />
  );
}
