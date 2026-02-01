/**
 * Motion-enhanced components for ZeroTrace
 * Re-exports from the motion system with app-specific defaults
 */

export { 
  AnimatedMessage,
  ChatTransition, 
  Sidebar3D,
  TiltAvatar,
  TiltCard,
  EncryptionLock,
  Glassmorphism,
  FloatingGlass,
  ParticleField,
  CallPortal,
  IncomingCallOverlay,
  SecureTunnel,
} from '@/lib/motion';

// App-specific motion wrappers
export { MotionMessageBubble } from './MotionMessageBubble';
export { MotionChatView } from './MotionChatView';
export { MotionSidebar } from './MotionSidebar';
export { MotionAvatar } from './MotionAvatar';
