# 📹 Secure Video Calling System Setup Guide

Complete guide for setting up end-to-end encrypted video calling with smart window management.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   WebRTC    │  │   PiP API   │  │   Window Management     │  │
│  │  Peer Conn  │  │  Floating   │  │   Focus/Visibility      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ WebSocket (Signaling)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SIGNALING SERVER                            │
│                    FastAPI + WebSockets                          │
│  • Call offer/answer                                             │
│  • ICE candidate exchange                                        │
│  • Presence/status                                               │
│  • NO media relay (zero-knowledge)                               │
└─────────────────────────────────────────────────────────────────┘
```

## 🔐 Security Features

- **DTLS-SRTP**: All media encrypted in transit
- **Peer-to-Peer**: Direct connection, no server relay
- **ICE/STUN/TURN**: NAT traversal with fallback
- **Certificate Pinning**: Prevents MITM attacks
- **No Call Recording**: Server never sees plaintext

## 📦 Files Structure

### Web Client
```
web-client/src/
├── hooks/
│   ├── usePictureInPicture.ts    # Native PiP API hook
│   ├── useWindowFocus.ts         # Window focus/visibility tracking
│   └── useDraggable.ts           # Drag functionality hook
├── contexts/
│   └── CallProvider.tsx          # Global call state management
├── components/
│   ├── DraggablePiP.tsx          # Floating video window
│   ├── SmartCallOverlay.tsx      # Auto-minimize overlay
│   └── EnhancedCallView.tsx      # Main call UI
└── lib/
    └── webrtc.ts                 # WebRTC service (existing)
```

### Mobile App
```
mobile-app/src/
└── components/
    └── VideoCall/
        ├── CallScreen.tsx        # Native video call UI
        └── index.ts
```

### Backend
```
backend/app/api/
└── websocket.py                  # Signaling server (existing)
```

## 🚀 Quick Setup

### 1. Web Client Setup

#### Install Dependencies
```bash
cd secure-comm/web-client
npm install
```

#### Wrap App with CallProvider
Edit `src/app/layout.tsx`:

```tsx
import { CallProvider } from '@/contexts/CallProvider';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CallProvider>
          {children}
          <EnhancedCallView /> {/* Global call UI */}
        </CallProvider>
      </body>
    </html>
  );
}
```

#### Add Call Button to Chat
Edit your chat component:

```tsx
import { useCall } from '@/contexts/CallProvider';

function ChatHeader({ contact }) {
  const { startCall } = useCall();
  
  return (
    <div className="flex items-center gap-2">
      <button 
        onClick={() => startCall(contact.username, 'video')}
        className="p-2 bg-blue-500 rounded-full"
      >
        📹 Video Call
      </button>
      <button 
        onClick={() => startCall(contact.username, 'audio')}
        className="p-2 bg-blue-500 rounded-full"
      >
        📞 Audio Call
      </button>
    </div>
  );
}
```

### 2. Mobile App Setup

#### Install react-native-webrtc
```bash
cd secure-comm/mobile-app
npm install react-native-webrtc
```

#### iOS Setup
```bash
cd ios
pod install
```

Add to `ios/YourApp/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>Camera access needed for video calls</string>
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access needed for calls</string>
```

#### Android Setup
Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

#### Background Audio (iOS)
Enable "Audio, AirPlay, and Picture in Picture" background mode in Xcode.

### 3. Backend Configuration

The backend WebSocket signaling is already configured in `app/api/websocket.py`.

Key WebSocket message types:
- `call_offer` - Initiate call
- `call_answer` - Accept call
- `call_reject` - Reject call
- `call_end` - End call
- `ice_candidate` - ICE candidate exchange

## 🎯 Usage Examples

### Starting a Video Call
```tsx
import { useCall } from '@/contexts/CallProvider';

function ContactCard({ username }) {
  const { startCall } = useCall();
  
  const handleVideoCall = async () => {
    const success = await startCall(username, 'video');
    if (!success) {
      alert('Failed to start call. Check camera permissions.');
    }
  };
  
  return <button onClick={handleVideoCall}>Video Call</button>;
}
```

### Handling Incoming Calls
```tsx
import { useCall } from '@/contexts/CallProvider';
import { useEffect } from 'react';

function IncomingCallHandler() {
  const { callState, answerCall, rejectCall } = useCall();
  
  if (callState?.status === 'ringing' && callState?.isIncoming) {
    return (
      <div className="incoming-call-modal">
        <p>{callState.remoteUsername} is calling...</p>
        <button onClick={answerCall}>Answer</button>
        <button onClick={rejectCall}>Decline</button>
      </div>
    );
  }
  
  return null;
}
```

### Using Hooks Directly
```tsx
import { usePictureInPicture } from '@/hooks/usePictureInPicture';
import { useWindowFocus } from '@/hooks/useWindowFocus';

function CustomCallView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isActive, togglePiP } = usePictureInPicture(videoRef);
  const { isFocused, isVisible } = useWindowFocus({
    onBlur: () => console.log('Window lost focus'),
  });
  
  return (
    <video ref={videoRef}>
      <button onClick={togglePiP}>
        {isActive ? 'Exit PiP' : 'Enter PiP'}
      </button>
    </video>
  );
}
```

## 📱 Features

### Web Features
- ✅ **Draggable PiP**: Move video anywhere on screen
- ✅ **Auto-minimize**: Call persists when switching tabs
- ✅ **Native PiP**: Browser Picture-in-Picture API support
- ✅ **Fullscreen**: One-click fullscreen mode
- ✅ **Screen Share**: Share your screen during calls
- ✅ **Keyboard Shortcuts**: Mute (M), Video (V), End (E)

### Mobile Features
- ✅ **Native PiP**: iOS/Android Picture-in-Picture
- ✅ **Background Audio**: Call continues in background
- ✅ **Draggable Overlay**: Move PiP window
- ✅ **Speaker/Earpiece**: Toggle audio output
- ✅ **Camera Switch**: Front/back camera toggle

## 🔧 Configuration

### ICE Servers (STUN/TURN)
Edit `src/lib/webrtc.ts`:

```typescript
const defaultConfig: CallConfig = {
  iceServers: [
    // Google's public STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    
    // Your TURN server for relay
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'user',
      credential: 'pass'
    }
  ]
};
```

### Auto-Minimize Behavior
Edit `SmartCallOverlay.tsx`:

```typescript
<SmartCallOverlay
  minimizeOnBlur={true}  // Auto-minimize on tab switch
  showNotification={true} // Show browser notification
/>
```

## 🧪 Testing

### Local Testing
```bash
# Terminal 1: Start backend
cd secure-comm/backend
python -m uvicorn app.main:app --reload

# Terminal 2: Start web client
cd secure-comm/web-client
npm run dev

# Open two browser tabs
# Login as different users
# Test calling between them
```

### Test Cases
| Test | Expected Result |
|------|-----------------|
| Start video call | Local video appears, remote receives offer |
| Answer call | Connection established within 5 seconds |
| Drag PiP window | Window moves smoothly, snaps to edges |
| Switch tab | Call minimizes to floating overlay |
| Minimize browser | Native PiP activates (if supported) |
| Network drop | Auto-reconnect attempt |
| End call | UI returns to chat, streams cleaned up |

## 🐛 Troubleshooting

### Camera not working
1. Check browser permissions
2. Ensure HTTPS or localhost
3. Try: `navigator.mediaDevices.getUserMedia({video:true})`

### No remote video
1. Check ICE candidates exchanged
2. Verify both on same network or TURN configured
3. Check firewall settings

### PiP not working
- Safari: Requires user gesture
- Chrome: May need flag enabled
- Firefox: Limited support

## 📚 API Reference

### useCall() Hook
```typescript
const {
  callState,          // Current call state
  isInCall,           // Boolean
  callDuration,       // Seconds
  startCall,          // (username, type) => Promise<boolean>
  answerCall,         // () => Promise<boolean>
  rejectCall,         // () => void
  endCall,            // () => void
  toggleMute,         // () => void
  toggleVideo,        // () => void
  toggleScreenShare,  // () => Promise<boolean>
  toggleFullscreen,   // () => void
  swapVideos,         // () => void
} = useCall();
```

### WebSocket Messages
```typescript
// Send offer
{ type: 'call_offer', data: { call_id, recipient_username, call_type, sdp } }

// Send answer
{ type: 'call_answer', data: { call_id, sdp } }

// Send ICE candidate
{ type: 'ice_candidate', data: { call_id, candidate } }

// End call
{ type: 'call_end', data: { call_id } }
```

## 🎨 Customization

### Styling the PiP Window
Edit `DraggablePiP.tsx`:
```typescript
<DraggablePiP
  initialPosition={{ x: 20, y: 100 }}
  initialSize={{ width: 200, height: 150 }}
  className="rounded-2xl shadow-2xl"
/>
```

### Custom Controls
```tsx
<EnhancedCallView>
  <CustomControlButton onClick={myCustomAction} />
</EnhancedCallView>
```

## 🔒 Privacy & Security

- **No server recording**: All media P2P
- **Encrypted signaling**: WebSocket over WSS
- **ICE consent**: User must accept camera/mic
- **No data retention**: Call metadata only

## 📝 License

MIT License - Part of CipherLink E2E Communication Platform
