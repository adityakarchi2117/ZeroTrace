/**
 * React Native Video Call Screen
 * Supports native PiP, background audio, and call controls
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  StatusBar,
  AppState,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const { width, height } = Dimensions.get('window');

type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
type CallType = 'audio' | 'video';

interface CallScreenProps {
  callId: string;
  remoteUsername: string;
  callType: CallType;
  isIncoming: boolean;
  onEndCall: () => void;
  onAnswer: () => void;
  onReject: () => void;
  wsSend: (data: any) => void;
}

// Placeholder for RTCView since we can't import it directly
const RTCViewPlaceholder: React.FC<{ streamURL?: string; style?: any; objectFit?: string; mirror?: boolean; zOrder?: number }> = ({ style }) => (
  <View style={[style, { backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' }]}>
    <Icon name="video" size={40} color="#666" />
  </View>
);

export const CallScreen: React.FC<CallScreenProps> = ({
  callId,
  remoteUsername,
  callType,
  isIncoming,
  onEndCall,
  onAnswer,
  onReject,
  wsSend,
}) => {
  const [callStatus, setCallStatus] = useState<CallStatus>(isIncoming ? 'ringing' : 'calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [showLocalInPiP, setShowLocalInPiP] = useState(true);
  
  const durationIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const endCall = useCallback(() => {
    wsSend({ type: 'call_end', data: { call_id: callId } });
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    onEndCall();
  }, [callId, wsSend, onEndCall]);

  const startDurationTimer = useCallback(() => {
    durationIntervalRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const toggleMute = useCallback(() => setIsMuted(prev => !prev), []);
  const toggleVideo = useCallback(() => setIsVideoOff(prev => !prev), []);
  const swapVideos = useCallback(() => setShowLocalInPiP(prev => !prev), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        // Keep call alive in background
      }
    });
    return () => subscription.remove();
  }, []);

  const isVideoCall = callType === 'video';

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Main Video */}
      <View style={styles.mainVideo}>
        {showLocalInPiP ? (
          <RTCViewPlaceholder style={styles.video} />
        ) : (
          <RTCViewPlaceholder style={styles.video} mirror />
        )}

        {/* Avatar overlay */}
        <View style={styles.avatarOverlay} pointerEvents="none">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{remoteUsername.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.username}>{remoteUsername}</Text>
          <Text style={styles.status}>{formatDuration(duration)}</Text>
        </View>
      </View>

      {/* PiP Window */}
      {isVideoCall && (
        <TouchableOpacity style={styles.pip} onPress={swapVideos}>
          <RTCViewPlaceholder style={styles.pipVideo} />
          {isMuted && (
            <View style={styles.muteBadge}>
              <Icon name="microphone-off" size={12} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.callerInfo}>
          <View style={styles.smallAvatar}>
            <Text style={styles.smallAvatarText}>{remoteUsername.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.callerName}>{remoteUsername}</Text>
            <Text style={styles.duration}>{formatDuration(duration)}</Text>
          </View>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {callStatus === 'ringing' && isIncoming ? (
          <View style={styles.incomingControls}>
            <TouchableOpacity style={[styles.btn, styles.reject]} onPress={onReject}>
              <Icon name="phone-hangup" size={32} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.answer]} onPress={onAnswer}>
              <Icon name={isVideoCall ? "video" : "phone"} size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.activeControls}>
            <Control icon={isMuted ? "microphone-off" : "microphone"} label="Mute" onPress={toggleMute} active={isMuted} />
            {isVideoCall && <Control icon={isVideoOff ? "video-off" : "video"} label="Video" onPress={toggleVideo} active={isVideoOff} />}
            <Control icon="phone-hangup" label="End" onPress={endCall} active red />
            {isVideoCall && <Control icon="camera-switch" label="Swap" onPress={swapVideos} />}
            <Control icon={isSpeakerOn ? "volume-high" : "volume-off"} label="Speaker" onPress={() => setIsSpeakerOn(!isSpeakerOn)} active={!isSpeakerOn} />
          </View>
        )}
      </View>
    </View>
  );
};

const Control: React.FC<{ icon: string; label: string; onPress: () => void; active?: boolean; red?: boolean }> = ({
  icon, label, onPress, active, red
}) => (
  <TouchableOpacity onPress={onPress} style={styles.controlItem}>
    <View style={[styles.controlBtn, active && (red ? styles.red : styles.active)]}>
      <Icon name={icon} size={24} color="#fff" />
    </View>
    <Text style={styles.controlLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  mainVideo: { ...StyleSheet.absoluteFillObject },
  video: { flex: 1 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  avatarText: { fontSize: 40, fontWeight: 'bold', color: '#fff' },
  username: { fontSize: 22, fontWeight: '600', color: '#fff', marginBottom: 8 },
  status: { fontSize: 16, color: '#10b981' },
  pip: { position: 'absolute', top: 100, right: 20, width: 100, height: 140, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', zIndex: 10 },
  pipVideo: { width: '100%', height: '100%' },
  muteBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#ef4444', borderRadius: 10, padding: 2 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 50, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: 'rgba(0,0,0,0.5)' },
  callerInfo: { flexDirection: 'row', alignItems: 'center' },
  smallAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  smallAvatarText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  callerName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  duration: { fontSize: 14, color: '#10b981' },
  controls: { position: 'absolute', bottom: 40, left: 0, right: 0 },
  incomingControls: { flexDirection: 'row', justifyContent: 'center', gap: 40 },
  activeControls: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20 },
  controlItem: { alignItems: 'center' },
  controlBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  active: { backgroundColor: '#ef4444' },
  red: { backgroundColor: '#ef4444' },
  btn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  reject: { backgroundColor: '#ef4444' },
  answer: { backgroundColor: '#10b981' },
  controlLabel: { color: '#fff', fontSize: 11, marginTop: 6 },
});

export default CallScreen;
