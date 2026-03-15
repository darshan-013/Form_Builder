import React from 'react';

export default function Badge({ children, variant = 'text', className = '' }) {
  const variants = {
    text: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    number: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    date: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    error: "bg-red-500/10 text-red-500 border-red-500/20",
  };
  
  return (
    <span className={`
      inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold 
      uppercase tracking-wider border ${variants[variant] || variants.text} ${className}
    `}>
      {children}
    </span>
  );
}
