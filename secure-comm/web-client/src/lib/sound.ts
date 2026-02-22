/**
 * Notification Sound Utility
 * Handles playing notification sounds with volume control
 */

// Audio context for generating sounds
let audioContext: AudioContext | null = null;

// Sound enabled state
let soundEnabled = true;

// Volume level (0-1)
let volume = 0.5;

/**
 * Initialize audio context (must be called after user interaction).
 * AUDIT FIX: Also resumes suspended AudioContext (Chrome autoplay policy).
 */
export function initAudioContext(): void {
  if (!audioContext && typeof window !== 'undefined') {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Resume if suspended (Chrome requires user gesture before first playback)
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

/**
 * Play a notification sound
 */
export function playNotificationSound(): void {
  if (!soundEnabled) return;
  
  try {
    initAudioContext();
    if (!audioContext) return;
    
    // Create oscillator for a pleasant "ding" sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Sound parameters for a nice notification tone
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.exponentialRampToValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
    
    // Volume envelope
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * 0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.error('Failed to play notification sound:', error);
  }
}

/**
 * Play a message received sound (different tone)
 */
export function playMessageSound(): void {
  if (!soundEnabled) return;
  
  try {
    initAudioContext();
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Softer sound for messages
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
    oscillator.frequency.exponentialRampToValueAtTime(554.37, audioContext.currentTime + 0.08); // C#5
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * 0.2, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    console.error('Failed to play message sound:', error);
  }
}

/**
 * Play a call sound (ringing)
 */
export function playCallSound(): void {
  if (!soundEnabled) return;
  
  try {
    initAudioContext();
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Ringing pattern
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * 0.4, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);
    gainNode.gain.linearRampToValueAtTime(volume * 0.4, audioContext.currentTime + 0.25);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch (error) {
    console.error('Failed to play call sound:', error);
  }
}

/**
 * Enable/disable sounds
 */
export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  localStorage.setItem('zerotrace_sound_enabled', JSON.stringify(enabled));
}

/**
 * Get sound enabled state
 */
export function getSoundEnabled(): boolean {
  return soundEnabled;
}

/**
 * Set volume level
 */
export function setVolume(newVolume: number): void {
  volume = Math.max(0, Math.min(1, newVolume));
  localStorage.setItem('zerotrace_volume', JSON.stringify(volume));
}

/**
 * Get volume level
 */
export function getVolume(): number {
  return volume;
}

/**
 * Load sound settings from localStorage
 */
export function loadSoundSettings(): void {
  try {
    const savedEnabled = localStorage.getItem('zerotrace_sound_enabled');
    const savedVolume = localStorage.getItem('zerotrace_volume');
    
    if (savedEnabled !== null) {
      soundEnabled = JSON.parse(savedEnabled);
    }
    if (savedVolume !== null) {
      volume = JSON.parse(savedVolume);
    }
  } catch (e) {
    console.error('Failed to load sound settings:', e);
  }
}

// Load settings on module init
if (typeof window !== 'undefined') {
  loadSoundSettings();
}
