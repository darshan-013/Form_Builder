import React from 'react';

export default function Divider({ className = '', vertical = false }) {
  if (vertical) {
    return <div className={`w-[1px] h-full bg-gray-200 dark:bg-white/10 ${className}`} />;
  }
  return <div className={`h-[1px] w-full bg-gray-200 dark:bg-white/10 ${className}`} />;
}
