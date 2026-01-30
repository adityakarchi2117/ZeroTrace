# WebRTC Debugging Guide

## Quick Diagnostics

### Console Log Checklist
When making a call, you should see these logs in order:

#### Caller Side:
```
📞 START CALL: video to <username>
📞 Step 1: Getting user media...
✅ Got user media: audio,video
📞 State: IDLE → CALLING
📞 Step 3: Creating peer connection...
📞 Step 4: Adding local tracks...
✅ Added audio track
✅ Added video track
📞 Step 5: Creating offer...
✅ Offer created and set as local description
📞 Step 6: Sending offer...
✅ Call started successfully

[... waiting for answer ...]

✅ Call answer received
✅ Remote description (answer) set
📞 State: CALLING → CONNECTING
🔄 Connection state changed: connecting
🧊 ICE candidate added
🧊 ICE candidate added
🔄 Connection state changed: connected
📞 State: CONNECTING → CONNECTED ✅
🎥 Remote track received: audio
🎥 Remote track received: video
```

#### Receiver Side:
```
📞 Incoming call offer received: {...}
📞 Call state set to RINGING: {...}

[... user clicks answer ...]

📞 ANSWER CALL called
📞 Step 1: Getting user media...
✅ Got user media: audio,video
📞 Step 2: Creating peer connection...
📞 Step 3: Adding local tracks...
✅ Added audio track
✅ Added video track
📞 Step 4: Setting remote description...
✅ Remote description set
📞 Step 5: Creating answer...
✅ Answer created and set as local description
📞 State: RINGING → CONNECTING
📞 Step 6: Sending answer...
✅ Call answered successfully
🔄 Connection state changed: connecting
🧊 ICE candidate added
🔄 Connection state changed: connected
📞 State: CONNECTING → CONNECTED ✅
🎥 Remote track received: audio
🎥 Remote track received: video
```

## Common Issues & Solutions

### Issue: "Connecting..." forever

**Check 1: Are ICE candidates being exchanged?**
```
❌ Missing: 🧊 Sending ICE candidate / 🧊 ICE candidate received
```
- **Cause:** Signaling not working properly
- **Fix:** Check WebSocket connection, verify ICE messages are being sent/received

**Check 2: Is connectionState changing?**
```
🔄 Connection state changed: connecting
[... no "connected" after 10 seconds ...]
```
- **Cause:** NAT traversal issue (STUN insufficient)
- **Fix:** Add TURN server to iceServers config

**Check 3: Are tracks being added?**
```
❌ Missing: ✅ Added audio track / ✅ Added video track
```
- **Cause:** getUserMedia failed silently
- **Fix:** Check for NotAllowedError or NotFoundError

### Issue: No remote video/audio

**Check 1: Is ontrack firing?**
```
❌ Missing: 🎥 Remote track received
```
- **Cause:** SDP negotiation failed
- **Fix:** Check that setRemoteDescription succeeded before creating answer

**Check 2: Is srcObject set?**
```javascript
// In browser console
remoteVideoRef.current.srcObject
// Should return MediaStream with tracks
```

**Check 3: Are tracks enabled?**
```javascript
// Check if tracks are muted
callState.remoteStream.getTracks().forEach(t => {
  console.log(t.kind, 'enabled:', t.enabled, 'muted:', t.muted);
});
```

### Issue: Mute/Camera buttons don't work

**Check:**
```javascript
// Should see these logs
🎤 Audio muted
🎤 Audio unmuted
📹 Video off
📹 Video on
```

If missing:
- Check that localStream is still active
- Verify toggleMute/toggleVideo return values

### Issue: Permission errors

**Error: NotAllowedError**
```
User clicked "Block" on permission prompt
```
- **Fix:** User must manually allow in browser settings
- **UI:** Show helpful message with instructions

**Error: NotFoundError**
```
No camera/microphone found
```
- **Fix:** Check device connections
- **UI:** Show "Connect a camera" message

**Error: NotReadableError**
```
Camera in use by another app
```
- **Fix:** Close other apps using camera (Zoom, Teams, etc.)

## Browser Debugging Tools

### Chrome DevTools
1. **chrome://webrtc-internals/**
   - Shows all active peer connections
   - Displays ICE candidates, stats, graphs
   - Check "Connection state" timeline

2. **Network Tab**
   - Filter by "WS" to see WebSocket messages
   - Look for `call_offer`, `call_answer`, `ice_candidate`

### Firefox
1. **about:webrtc**
   - Similar to Chrome's webrtc-internals
   - Shows SDP offers/answers
   - ICE candidate list

## Testing Commands

```javascript
// Check if peer connection exists
webrtcService.getCurrentCall()

// Check peer connection state
// (In console, set a breakpoint in webrtc.ts)
this.peerConnection.connectionState  // should be 'connected'
this.peerConnection.iceConnectionState  // should be 'connected'

// Check local stream
callState.localStream.getTracks().forEach(t => console.log(t.kind, t.readyState))

// Check remote stream  
callState.remoteStream.getTracks().forEach(t => console.log(t.kind, t.readyState))
```

## Network Requirements

| Protocol | Port | Purpose |
|----------|------|---------|
| UDP | 3478 | STUN |
| UDP | 19302-19307 | Google STUN servers |
| UDP | 1024-65535 | RTP/RTCP (random) |
| TCP | 443 | TURN (if configured) |
| WSS | 443 | WebSocket signaling |

## Mobile-Specific Issues

### iOS Safari
- Must use `playsInline` attribute on video elements
- Autoplay requires user gesture
- Backgrounding the app pauses WebRTC

### Android Chrome
- May require `android:usesCleartextTraffic="false"` for secure context
- Check battery optimization settings (may kill background WebRTC)

## Quick Fixes

```javascript
// Force reconnect
webrtcService.endCall();
setTimeout(() => webrtcService.startCall('user', 'video'), 1000);

// Reset permissions
// Chrome: Click lock icon in address bar → Reset permissions
// Firefox: Click lock icon → Clear permissions

// Clear pending ICE candidates
webrtcService['pendingIceCandidates'] = [];
```

## Getting Help

When reporting issues, include:
1. Browser version
2. Console logs (from both caller and receiver)
3. Network tab screenshot (WebSocket messages)
4. chrome://webrtc-internals export (if Chrome)
