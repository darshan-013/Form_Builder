import React, { useState, useRef, useEffect } from 'react';
import Card from './Card';

export default function Dropdown({ trigger, children, align = 'right' }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const alignments = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>
      
      {isOpen && (
        <Card className={`
          absolute z-50 mt-2 min-w-[200px] overflow-hidden p-1
          shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200
          ${alignments[align]}
        `}>
          <div onClick={() => setIsOpen(false)}>
            {children}
          </div>
        </Card>
      )}
    </div>
  );
}
