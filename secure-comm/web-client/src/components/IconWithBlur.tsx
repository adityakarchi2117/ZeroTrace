'use client';

import React, { FC, ReactNode } from 'react';
import ShapeBlur from './ShapeBlur';

interface IconWithBlurProps {
  children: ReactNode;
  className?: string;
  iconClassName?: string;
  variation?: number;
  shapeSize?: number;
  roundness?: number;
  borderSize?: number;
  circleSize?: number;
  circleEdge?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const sizeMap = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
};

const IconWithBlur: FC<IconWithBlurProps> = ({
  children,
  className = '',
  iconClassName = 'text-cipher-primary',
  variation = 0,
  shapeSize = 1.2,
  roundness = 0.5,
  borderSize = 0.08,
  circleSize = 0.5,
  circleEdge = 1.5,
  size = 'md',
}) => {
  return (
    <div 
      className={`relative ${sizeMap[size]} flex-shrink-0 overflow-hidden rounded-lg ${className}`}
    >
      {/* ShapeBlur effect layer */}
      <div className="absolute inset-0">
        <ShapeBlur
          variation={variation}
          pixelRatioProp={typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2}
          shapeSize={shapeSize}
          roundness={roundness}
          borderSize={borderSize}
          circleSize={circleSize}
          circleEdge={circleEdge}
        />
      </div>
      
      {/* Background layer */}
      <div className="absolute inset-0 bg-cipher-primary/10 rounded-lg" />
      
      {/* Icon layer */}
      <div className={`relative z-10 w-full h-full flex items-center justify-center ${iconClassName}`}>
        {children}
      </div>
    </div>
  );
};

export default IconWithBlur;
