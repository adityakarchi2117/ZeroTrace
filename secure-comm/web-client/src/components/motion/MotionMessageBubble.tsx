'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { AnimatedMessage } from '@/lib/motion';
import { useAppearance } from '@/lib/useAppearance';
import { Check, CheckCheck, Clock, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface MotionMessageBubbleProps {
  content: React.ReactNode;
  isSent: boolean;
  timestamp: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  isNew?: boolean;
  index?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function MotionMessageBubble({
  content,
  isSent,
  timestamp,
  status,
  isNew = false,
  index = 0,
  onContextMenu,
}: MotionMessageBubbleProps) {
  const { getAccentColors } = useAppearance();
  const accentColors = getAccentColors();

  const getStatusIcon = () => {
    switch (status) {
      case 'sending':
        return <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />;
      case 'sent':
        return <Check className="w-3 h-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="w-3 h-3" style={{ color: accentColors.primary }} />;
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Clock className="w-3 h-3 text-gray-500" />;
    }
  };

  const bubbleStyle = isSent ? {
    background: `linear-gradient(135deg, ${accentColors.primary}dd, ${accentColors.secondary}99)`,
  } : {};

  return (
    <AnimatedMessage 
      isSent={isSent} 
      isNew={isNew} 
      index={index}
      className="max-w-[70%] rounded-2xl relative group"
    >
      <div 
        className={`
          px-4 py-2.5 rounded-2xl
          ${isSent 
            ? 'rounded-br-md ml-auto' 
            : 'bg-gray-800 rounded-bl-md mr-auto'
          }
        `}
        style={bubbleStyle}
        onContextMenu={onContextMenu}
      >
        <div className="text-sm leading-relaxed">
          {content}
        </div>
        <div className={`flex items-center gap-1 mt-1 ${isSent ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] opacity-70">
            {format(new Date(timestamp), 'HH:mm')}
          </span>
          {isSent && getStatusIcon()}
        </div>
      </div>

      {/* Hover glow effect */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          boxShadow: isSent 
            ? `0 4px 20px -4px ${accentColors.primary}50`
            : '0 4px 20px -4px rgba(0,0,0,0.3)',
        }}
      />
    </AnimatedMessage>
  );
}

export default MotionMessageBubble;
