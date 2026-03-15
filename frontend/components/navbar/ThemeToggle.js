import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import Button from '../ui/Button';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="secondary"
      size="sm"
      className="!rounded-full w-9 h-9 !p-0"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
    >
      <span className="text-lg">
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
    </Button>
  );
}
