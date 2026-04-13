'use client';
import React, { useRef, useState } from 'react';
import { motion, useSpring, useMotionValue, useTransform } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

export default function SpotlightCard({ 
  children, 
  className = "", 
  style = {}, 
  contentStyle = { transform: 'translateZ(20px)' },
  spotlightColor = "rgba(124, 58, 237, 0.15)",
  tiltStrength = 4,
  glowSize = 350
}) {
  const { theme } = useTheme();
  const divRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  // Motion values for tilt
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [tiltStrength, -tiltStrength]), { damping: 20, stiffness: 200 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-tiltStrength, tiltStrength]), { damping: 20, stiffness: 200 });

  const handleMouseMove = (e) => {
    if (!divRef.current || !isFocused) return;

    const rect = divRef.current.getBoundingClientRect();
    const { clientX, clientY } = e;
    
    // Relative position for spotlight
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    setPosition({ x: mouseX, y: mouseY });

    // Relative position for tilt (-0.5 to 0.5)
    x.set((mouseX / rect.width) - 0.5);
    y.set((mouseY / rect.height) - 0.5);
  };

  const handleMouseEnter = () => {
    setOpacity(1);
    setIsFocused(true);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
    setIsFocused(false);
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        ...style,
        position: 'relative',
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        perspective: '1000px',
      }}
      className={className}
    >
      {/* Spotlight Glow Layer */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '-1px',
          borderRadius: 'inherit',
          background: `radial-gradient(${glowSize}px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
          opacity,
          transition: 'opacity 0.4s ease',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
      
      {/* Content wrapper to ensure optional 3D depth. translation can blur small fonts in some browsers. */}
      <div style={{ width: '100%', height: '100%', ...contentStyle }}>
        {children}
      </div>
    </motion.div>
  );
}
