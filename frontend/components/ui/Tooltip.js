import React, { useState } from 'react';

export default function Tooltip({ children, content, position = 'top' }) {
  const [active, setActive] = useState(false);
  
  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };
  
  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      {children}
      {active && content && (
        <div className={`
          absolute z-[100] px-2.5 py-1 text-xs font-medium text-white 
          bg-slate-900 border border-white/10 rounded-md whitespace-nowrap
          shadow-xl animate-in fade-in zoom-in duration-150
          ${positions[position]}
        `}>
          {content}
        </div>
      )}
    </div>
  );
}
