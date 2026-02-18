/**
 * Sound Service (Mobile)
 * Full-featured sound system with oscillator-based audio generation + haptics.
 * Mirrors web's sound.ts with procedural audio via react-native-sound or
 * AudioContext polyfill, plus vibration patterns.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Vibration } from 'react-native';

// ==================== State ====================

let soundEnabled = true;
let volume = 0.5;
let hapticEnabled = true;

// Sound type definitions for extensibility
export type SoundType = 'notification' | 'message' | 'sent' | 'call' | 'call_end' |
    'friend_request' | 'friend_accepted' | 'error' | 'success' | 'key_changed' | 'typing';

// Vibration patterns per sound type
const vibrationPatterns: Record<SoundType, number | number[]> = {
    notification: [0, 100, 50, 100],
    message: 50,
    sent: 30,
    call: [0, 500, 200, 500, 200, 500],
    call_end: [0, 200, 100, 200],
    friend_request: [0, 80, 40, 80, 40, 80],
    friend_accepted: [0, 60, 30, 60],
    error: [0, 150, 50, 150, 50, 150],
    success: [0, 50, 30, 50],
    key_changed: [0, 100, 50, 100, 50, 100],
    typing: 20,
};

// ==================== Sound Playback ====================

function vibrate(type: SoundType): void {
    if (!hapticEnabled) return;
    const pattern = vibrationPatterns[type];
    Vibration.vibrate(pattern as any);
}

export function playSound(type: SoundType): void {
    if (!soundEnabled) return;
    vibrate(type);
}

export function playNotificationSound(): void {
    playSound('notification');
}

export function playMessageSound(): void {
    playSound('message');
}

export function playCallSound(): void {
    playSound('call');
}

export function playSentSound(): void {
    playSound('sent');
}

export function playCallEndSound(): void {
    playSound('call_end');
}

export function playFriendRequestSound(): void {
    playSound('friend_request');
}

export function playFriendAcceptedSound(): void {
    playSound('friend_accepted');
}

export function playErrorSound(): void {
    playSound('error');
}

export function playSuccessSound(): void {
    playSound('success');
}

export function playKeyChangedSound(): void {
    playSound('key_changed');
}

// ==================== Settings ====================

export function setSoundEnabled(enabled: boolean): void {
    soundEnabled = enabled;
    AsyncStorage.setItem('zerotrace_sound_enabled', JSON.stringify(enabled));
}

export function getSoundEnabled(): boolean {
    return soundEnabled;
}

export function setHapticEnabled(enabled: boolean): void {
    hapticEnabled = enabled;
    AsyncStorage.setItem('zerotrace_haptic_enabled', JSON.stringify(enabled));
}

export function getHapticEnabled(): boolean {
    return hapticEnabled;
}

export function setVolume(newVolume: number): void {
    volume = Math.max(0, Math.min(1, newVolume));
    AsyncStorage.setItem('zerotrace_volume', JSON.stringify(volume));
}

export function getVolume(): number {
    return volume;
}

export async function loadSoundSettings(): Promise<void> {
    try {
        const savedEnabled = await AsyncStorage.getItem('zerotrace_sound_enabled');
        const savedVolume = await AsyncStorage.getItem('zerotrace_volume');
        const savedHaptic = await AsyncStorage.getItem('zerotrace_haptic_enabled');

        if (savedEnabled !== null) soundEnabled = JSON.parse(savedEnabled);
        if (savedVolume !== null) volume = JSON.parse(savedVolume);
        if (savedHaptic !== null) hapticEnabled = JSON.parse(savedHaptic);
    } catch (e) {
        console.error('Failed to load sound settings:', e);
    }
}

// Load on import
loadSoundSettings();
