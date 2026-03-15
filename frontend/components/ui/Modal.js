import React, { useEffect } from 'react';
import Card from './Card';

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md', footer }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <Card className={`relative w-full ${maxWidth} animate-in fade-in zoom-in duration-200`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {title}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6">
          {children}
        </div>
        
        {footer && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
            {footer}
          </div>
        )}
      </Card>
    </div>
  );
}
