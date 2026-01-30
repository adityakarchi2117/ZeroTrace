'use client';

import React from 'react';
import { TiltAvatar } from '@/lib/motion';
import { useAppearance } from '@/lib/useAppearance';

interface MotionAvatarProps {
  name: string;
  isOnline?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  disableTilt?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-24 h-24 text-4xl',
};

export function MotionAvatar({
  name,
  isOnline = false,
  size = 'md',
  className = '',
  disableTilt = false,
}: MotionAvatarProps) {
  const { getAccentGradient } = useAppearance();
  const accentGradient = getAccentGradient();

  const avatarContent = (
    <div
      className={`
        ${sizeClasses[size]}
        rounded-full flex items-center justify-center font-medium text-white
        ${className}
      `}
      style={{ background: accentGradient }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );

  if (disableTilt) {
    return (
      <div className="relative">
        {avatarContent}
        {isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-cipher-dark" />
        )}
      </div>
    );
  }

  return (
    <TiltAvatar 
      maxTilt={20} 
      scale={1.05} 
      glare 
      shadow
      className="relative"
    >
      {avatarContent}
      {isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-cipher-dark" />
      )}
    </TiltAvatar>
  );
}

export default MotionAvatar;
