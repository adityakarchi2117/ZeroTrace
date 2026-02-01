# ZeroTrace Motion System

A premium, GPU-accelerated 3D animation system for the ZeroTrace secure messenger. Built with Framer Motion, GSAP, and React Three Fiber.

## Features

- **60 FPS Animations**: Optimized for smooth performance
- **GPU-Accelerated**: Uses CSS transforms and compositor layers
- **Reduced Motion Support**: Respects user accessibility preferences
- **Battery Efficient**: Auto-disables on low battery/low-end devices
- **Progressive Enhancement**: Graceful fallbacks for older devices
- **Mobile + Web Optimized**: Adaptive quality based on device capabilities

## Architecture

```
motion/
├── components/          # Reusable animation components
│   ├── AnimatedMessage.tsx    # 3D bubble pop animations
│   ├── CallPortal.tsx         # Portal expansion for calls
│   ├── ChatTransition.tsx     # 3D chat slide transitions
│   ├── EncryptionLock.tsx     # Lock rotation animation
│   ├── Glassmorphism.tsx      # Glass effect components
│   ├── ParticleField.tsx      # Background particles
│   └── TiltAvatar.tsx         # 3D tilt on hover
├── hooks/               # Animation hooks
│   ├── use3DTilt.ts           # 3D tilt effect hook
│   ├── useMotion.ts           # Main motion hook
│   ├── usePerformance.ts      # Device capability detection
│   └── useReducedMotion.ts    # Accessibility hook
├── config.ts            # Animation presets & variants
├── types.ts             # TypeScript definitions
├── MotionProvider.tsx   # Context provider
└── index.ts             # Public API exports
```

## Quick Start

### 1. Wrap your app with MotionProvider

```tsx
import { MotionProvider } from '@/lib/motion';

export default function Layout({ children }) {
  return (
    <MotionProvider>
      {children}
    </MotionProvider>
  );
}
```

### 2. Use animated components

```tsx
import { AnimatedMessage, TiltAvatar, ChatTransition } from '@/lib/motion';

// Animated message bubble
<AnimatedMessage isSent={true} isNew={true} index={0}>
  <div className="message-content">Hello!</div>
</AnimatedMessage>

// 3D tilt avatar
<TiltAvatar name="John" isOnline={true} size="md" />

// Chat transition
<ChatTransition isActive={true}>
  <ChatContent />
</ChatTransition>
```

### 3. Use motion hooks

```tsx
import { useMotion, use3DTilt } from '@/lib/motion';

function MyComponent() {
  const { shouldAnimate, isLowEnd } = useMotion({ type: 'bubble-pop' });
  const { ref, style, handlers } = use3DTilt({ maxTilt: 15 });
  
  return (
    <div ref={ref} style={style} {...handlers}>
      Content
    </div>
  );
}
```

## Animation Types

### Chat Transition (3D Slide)
- Sidebar rotates in Z-axis
- Chat window slides forward
- Depth blur background
- Duration: 400ms

### Message Bubble Pop
- Scale: 0.8 → 1.05 → 1.0
- Y-axis rotation
- Soft glow pulse for new messages
- Duration: 350ms

### Call Portal
- Circular morphing to fullscreen
- Glass layer fade-in
- Expansion ring effect
- Duration: 600ms

### Profile Avatar Tilt
- Parallax tilt on mouse move
- Light reflection overlay
- Depth shadow
- Max tilt: 15-20 degrees

### Encryption Lock
- 3D rotation animation
- Particle flow effect
- Glow pulse
- Duration: 1.5s loop

## Performance Considerations

### Automatic Optimizations
- **Low-end devices**: Simplified 2D animations
- **Low battery**: Reduced animation complexity
- **Reduced motion**: Instant transitions
- **Off-screen**: Animation pausing

### Best Practices
```tsx
// ✅ Good: Use transform instead of layout properties
<motion.div
  animate={{ x: 100, scale: 1.1 }}  // GPU accelerated
/>

// ❌ Bad: Avoid animating layout properties
<motion.div
  animate={{ width: 100, left: 100 }}  // Triggers layout
/>

// ✅ Good: Use will-change sparingly
<div className="will-change-transform" />

// ✅ Good: Respect reduced motion
const prefersReducedMotion = useReducedMotion();
```

## Configuration

### Default Config
```typescript
const defaultMotionConfig = {
  enabled: true,
  tier: 'high',              // 'low' | 'medium' | 'high'
  respectReducedMotion: true,
  maxConcurrentAnimations: 10,
  disableOnLowBattery: true,
};
```

### Custom Transition
```typescript
import { transitions, easings, springConfigs } from '@/lib/motion';

// Use presets
<motion.div transition={transitions.bubblePop} />

// Custom spring
<motion.div
  transition={{
    type: 'spring',
    stiffness: 400,
    damping: 20,
  }}
/>

// Custom easing
<motion.div
  transition={{
    duration: 0.4,
    ease: easings.elastic,
  }}
/>
```

## Accessibility

The system automatically:
- Detects `prefers-reduced-motion` media query
- Provides instant transitions when reduced motion is preferred
- Maintains functionality without animations
- Uses ARIA labels where appropriate

```tsx
// Manual check
const prefersReducedMotion = useReducedMotion();

// Automatic via useMotion
const { shouldAnimate } = useMotion();
// shouldAnimate is false when reduced motion is preferred
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13.1+
- Edge 80+

Fallbacks provided for:
- No WebGL support
- No backdrop-filter support
- Reduced motion preference

## Performance Benchmarks

Target metrics on mid-range devices:
- **First Paint**: < 100ms
- **Animation Start**: < 16ms
- **Frame Rate**: Consistent 60 FPS
- **Memory**: < 50MB for animation system

## License

Part of ZeroTrace - Private by Design, Secure by Default.
