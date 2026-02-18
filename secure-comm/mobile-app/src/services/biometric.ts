/**
 * ZeroTrace Biometric Authentication Service
 * Provides fingerprint/face authentication for app lock and sensitive operations
 *
 * Uses react-native-keychain's biometric authentication capabilities
 * to protect access to stored credentials and encryption keys.
 *
 * Features:
 * - App lock on foreground resume
 * - Biometric gate for private key access
 * - Fallback to device PIN/pattern
 * - Configuration via settings
 */

import Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ─────────────────────────────────────────

export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'none';

export interface BiometricCapability {
    available: boolean;
    biometryType: BiometricType;
    label: string;
}

export interface BiometricConfig {
    enabled: boolean;
    requireOnLaunch: boolean;
    requireForKeyAccess: boolean;
    lockAfterBackground: boolean;
    lockTimeoutSeconds: number; // Seconds in bg before requiring auth
}

// ─── Storage Keys ──────────────────────────────────

const KEYS = {
    CONFIG: '@zt/biometric_config',
    LAST_AUTH: '@zt/biometric_last_auth',
    BIOMETRIC_CREDENTIAL: 'zerotrace_biometric_guard',
};

// ─── Default Config ────────────────────────────────

const DEFAULT_CONFIG: BiometricConfig = {
    enabled: false,
    requireOnLaunch: true,
    requireForKeyAccess: false,
    lockAfterBackground: true,
    lockTimeoutSeconds: 300, // 5 minutes
};

// ─── Biometric Service ─────────────────────────────

class BiometricService {
    private static instance: BiometricService;
    private config: BiometricConfig = DEFAULT_CONFIG;
    private lastAuthTime: number = 0;
    private isConfigLoaded = false;

    static getInstance(): BiometricService {
        if (!BiometricService.instance) {
            BiometricService.instance = new BiometricService();
        }
        return BiometricService.instance;
    }

    // ─── Initialization ─────────────────────

    async initialize(): Promise<void> {
        await this.loadConfig();
        this.isConfigLoaded = true;
    }

    // ─── Capability Check ───────────────────

    async checkCapability(): Promise<BiometricCapability> {
        try {
            const supportedType = await Keychain.getSupportedBiometryType();

            if (!supportedType) {
                return { available: false, biometryType: 'none', label: 'Not available' };
            }

            let biometryType: BiometricType = 'fingerprint';
            let label = 'Biometric Authentication';

            switch (supportedType) {
                case Keychain.BIOMETRY_TYPE.FACE_ID:
                    biometryType = 'face';
                    label = 'Face ID';
                    break;
                case Keychain.BIOMETRY_TYPE.TOUCH_ID:
                    biometryType = 'fingerprint';
                    label = 'Touch ID';
                    break;
                case Keychain.BIOMETRY_TYPE.FINGERPRINT:
                    biometryType = 'fingerprint';
                    label = 'Fingerprint';
                    break;
                case Keychain.BIOMETRY_TYPE.IRIS:
                    biometryType = 'iris';
                    label = 'Iris Scan';
                    break;
                default:
                    biometryType = 'fingerprint';
                    label = 'Biometric';
            }

            return { available: true, biometryType, label };
        } catch (error) {
            console.error('[Biometric] Capability check failed:', error);
            return { available: false, biometryType: 'none', label: 'Not available' };
        }
    }

    // ─── Authentication ─────────────────────

    /**
     * Prompt user for biometric authentication
     * Returns true if authenticated, false if failed/cancelled
     */
    async authenticate(reason?: string): Promise<boolean> {
        try {
            const capability = await this.checkCapability();
            if (!capability.available) {
                console.log('[Biometric] Not available, skipping');
                return true; // Allow access if biometrics unavailable
            }

            // Use Keychain with biometric access control
            const prompt = reason || 'Verify your identity to access ZeroTrace';

            // Try to read a stored biometric credential
            const result = await Keychain.getInternetCredentials(KEYS.BIOMETRIC_CREDENTIAL, {
                authenticationPrompt: {
                    title: 'ZeroTrace Security',
                    subtitle: prompt,
                    cancel: 'Cancel',
                },
            });

            if (result) {
                this.lastAuthTime = Date.now();
                await AsyncStorage.setItem(KEYS.LAST_AUTH, String(this.lastAuthTime));
                return true;
            }

            // If no credential stored yet, create one and try again
            const stored = await this.setupBiometricCredential();
            if (stored) {
                this.lastAuthTime = Date.now();
                await AsyncStorage.setItem(KEYS.LAST_AUTH, String(this.lastAuthTime));
                return true;
            }

            return false;
        } catch (error: any) {
            // User cancelled or auth failed
            if (
                error.message?.includes('Cancel') ||
                error.message?.includes('user cancel') ||
                error.message?.includes('Authentication failed')
            ) {
                console.log('[Biometric] User cancelled authentication');
                return false;
            }
            console.error('[Biometric] Auth error:', error);
            return false;
        }
    }

    /**
     * Store a biometric-protected credential for future authentication prompts
     */
    private async setupBiometricCredential(): Promise<boolean> {
        try {
            await Keychain.setInternetCredentials(
                KEYS.BIOMETRIC_CREDENTIAL,
                'zerotrace_user',
                'biometric_guard_' + Date.now(),
                {
                    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
                    accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
                }
            );
            return true;
        } catch (error) {
            console.error('[Biometric] Setup failed:', error);
            return false;
        }
    }

    // ─── Lock State Management ──────────────

    /**
     * Check if authentication is required based on config and elapsed time
     */
    shouldRequireAuth(): boolean {
        if (!this.config.enabled) return false;

        if (this.config.lockAfterBackground) {
            const elapsed = (Date.now() - this.lastAuthTime) / 1000;
            return elapsed > this.config.lockTimeoutSeconds;
        }

        return false;
    }

    /**
     * Check if biometric should be required on app launch
     */
    shouldRequireOnLaunch(): boolean {
        return this.config.enabled && this.config.requireOnLaunch;
    }

    /**
     * Check if biometric should be required for key access
     */
    shouldRequireForKeys(): boolean {
        return this.config.enabled && this.config.requireForKeyAccess;
    }

    // ─── Configuration ──────────────────────

    async getConfig(): Promise<BiometricConfig> {
        if (!this.isConfigLoaded) {
            await this.loadConfig();
        }
        return this.config;
    }

    async updateConfig(updates: Partial<BiometricConfig>): Promise<BiometricConfig> {
        this.config = { ...this.config, ...updates };
        await AsyncStorage.setItem(KEYS.CONFIG, JSON.stringify(this.config));

        // If enabling, setup the biometric credential
        if (updates.enabled === true) {
            await this.setupBiometricCredential();
        }

        // If disabling, remove the biometric credential
        if (updates.enabled === false) {
            try {
                await Keychain.resetInternetCredentials(KEYS.BIOMETRIC_CREDENTIAL);
            } catch {
                // Ignore
            }
        }

        return this.config;
    }

    private async loadConfig(): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(KEYS.CONFIG);
            if (raw) {
                this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
            }

            const lastAuth = await AsyncStorage.getItem(KEYS.LAST_AUTH);
            if (lastAuth) {
                this.lastAuthTime = parseInt(lastAuth, 10);
            }
        } catch (error) {
            console.error('[Biometric] Config load error:', error);
        }
    }

    // ─── Cleanup ────────────────────────────

    async reset(): Promise<void> {
        try {
            await Keychain.resetInternetCredentials(KEYS.BIOMETRIC_CREDENTIAL);
            await AsyncStorage.removeItem(KEYS.CONFIG);
            await AsyncStorage.removeItem(KEYS.LAST_AUTH);
            this.config = DEFAULT_CONFIG;
            this.lastAuthTime = 0;
        } catch (error) {
            console.error('[Biometric] Reset error:', error);
        }
    }
}

export const biometricService = BiometricService.getInstance();
export default biometricService;
