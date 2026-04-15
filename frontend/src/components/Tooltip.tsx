import React, { useState, useRef, useEffect } from 'react';
import './Tooltip.css';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  delay?: number;
}

export default function Tooltip({ 
  text, 
  children, 
  position = 'bottom', 
  delay = 200 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div 
      className="tooltip-container" 
      onMouseEnter={showTooltip} 
      onMouseLeave={hideTooltip}
    >
      {children}
      <div className={`tooltip-box tooltip-${position} ${isVisible ? 'visible' : ''}`}>
        {text}
      </div>
    </div>
  );
}
