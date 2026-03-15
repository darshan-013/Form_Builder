import React from 'react';
import Container from '../ui/Container';

export default function PageContainer({ children, className = '', size = '7xl', py = true }) {
  return (
    <div className={`${py ? 'py-8 sm:py-10' : ''} ${className}`}>
      <Container size={size}>
        {children}
      </Container>
    </div>
  );
}
