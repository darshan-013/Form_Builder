import React from 'react';
import Container from '../ui/Container';

export default function SectionHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6 ${className}`}>
      <div className="space-y-1.5">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="text-base text-gray-500 dark:text-gray-400 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
