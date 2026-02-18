/**
 * Verification Badge Display Component
 * Shows verification badges inline with user profiles
 */

import React from 'react';
import { VerificationBadge, getBadgeColor, getBadgeIcon, getBadgeLabel } from '../lib/verificationApi';

interface VerificationBadgeDisplayProps {
  badges: VerificationBadge[];
  size?: 'small' | 'medium' | 'large';
  maxDisplay?: number;
}

export default function VerificationBadgeDisplay({ 
  badges, 
  size = 'medium',
  maxDisplay = 3 
}: VerificationBadgeDisplayProps) {
  if (!badges || badges.length === 0) return null;

  const activeBadges = badges.filter(b => b.is_active);
  const displayBadges = activeBadges.slice(0, maxDisplay);
  const remainingCount = activeBadges.length - maxDisplay;

  const sizeClasses = {
    small: 'w-4 h-4 text-xs',
    medium: 'w-5 h-5 text-sm',
    large: 'w-6 h-6 text-base',
  };

  return (
    <div className="inline-flex items-center gap-1">
      {displayBadges.map((badge) => {
        const color = badge.badge_color || getBadgeColor(badge.verification_type);
        const icon = badge.badge_icon || getBadgeIcon(badge.verification_type);
        const label = badge.badge_label || getBadgeLabel(badge.verification_type);

        return (
          <div
            key={badge.id}
            className={`${sizeClasses[size]} rounded-full flex items-center justify-center`}
            style={{ backgroundColor: color }}
            title={label}
          >
            <span className="text-white font-bold">{icon}</span>
          </div>
        );
      })}
      {remainingCount > 0 && (
        <span className="text-xs text-gray-400">+{remainingCount}</span>
      )}
    </div>
  );
}
