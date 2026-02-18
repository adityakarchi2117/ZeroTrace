// Module declarations for libraries without type definitions

declare module 'react-native-vector-icons/Ionicons' {
    import { Component } from 'react';
    import { TextProps } from 'react-native';

    interface IconProps extends TextProps {
        name: string;
        size?: number;
        color?: string;
    }

    export default class Icon extends Component<IconProps> { }
}

declare module 'react-native-vector-icons/MaterialCommunityIcons' {
    import { Component } from 'react';
    import { TextProps } from 'react-native';

    interface IconProps extends TextProps {
        name: string;
        size?: number;
        color?: string;
    }

    export default class Icon extends Component<IconProps> { }
}

declare module 'react-native-image-picker' {
    export interface ImagePickerResponse {
        assets?: Array<{
            uri?: string;
            fileName?: string;
            type?: string;
            fileSize?: number;
            width?: number;
            height?: number;
        }>;
        didCancel?: boolean;
        errorCode?: string;
        errorMessage?: string;
    }

    export interface ImageLibraryOptions {
        mediaType: 'photo' | 'video' | 'mixed';
        quality?: number;
        maxWidth?: number;
        maxHeight?: number;
        selectionLimit?: number;
    }

    export function launchImageLibrary(
        options: ImageLibraryOptions,
    ): Promise<ImagePickerResponse>;

    export function launchCamera(
        options: ImageLibraryOptions,
    ): Promise<ImagePickerResponse>;
}

declare module '@react-native-community/netinfo' {
    export interface NetInfoState {
        type: string;
        isConnected: boolean | null;
        isInternetReachable: boolean | null;
        details: any;
    }

    export type NetInfoSubscription = () => void;

    export function addEventListener(
        listener: (state: NetInfoState) => void
    ): NetInfoSubscription;

    export function fetch(): Promise<NetInfoState>;

    const NetInfo: {
        addEventListener: typeof addEventListener;
        fetch: typeof fetch;
    };

    export default NetInfo;
}

declare module 'react-native-webrtc' {
    import { Component } from 'react';
    import { ViewProps } from 'react-native';

    export class RTCPeerConnection {
        constructor(configuration: any);
        addTrack(track: any, stream: any): any;
        createOffer(options?: any): Promise<any>;
        createAnswer(): Promise<any>;
        setLocalDescription(desc: any): Promise<void>;
        setRemoteDescription(desc: any): Promise<void>;
        addIceCandidate(candidate: any): Promise<void>;
        getStats(): Promise<any>;
        close(): void;
        ontrack: ((event: any) => void) | null;
        onicecandidate: ((event: any) => void) | null;
        onconnectionstatechange: (() => void) | null;
        oniceconnectionstatechange: (() => void) | null;
        onsignalingstatechange: (() => void) | null;
        connectionState: string;
        iceConnectionState: string;
        signalingState: string;
    }

    export class RTCIceCandidate {
        constructor(candidate: any);
        toJSON(): any;
    }

    export class RTCSessionDescription {
        constructor(desc: { type: string; sdp: string });
    }

    export class MediaStream {
        constructor();
        addTrack(track: any): void;
        getTracks(): any[];
        getAudioTracks(): any[];
        getVideoTracks(): any[];
        toURL(): string;
    }

    export const mediaDevices: {
        getUserMedia(constraints: any): Promise<MediaStream>;
        enumerateDevices(): Promise<any[]>;
    };

    export interface RTCViewProps extends ViewProps {
        streamURL?: string;
        mirror?: boolean;
        objectFit?: 'contain' | 'cover';
        zOrder?: number;
    }

    export class RTCView extends Component<RTCViewProps> { }
}

declare module 'react-native-incall-manager' {
    export function start(options?: { media?: string; auto?: boolean; ringback?: string }): void;
    export function stop(options?: { busytone?: string }): void;
    export function turnScreenOn(): void;
    export function turnScreenOff(): void;
    export function setKeepScreenOn(enable: boolean): void;
    export function setSpeakerphoneOn(enable: boolean): void;
    export function setForceSpeakerphoneOn(flag: boolean): void;
    export function setMicrophoneMute(mute: boolean): void;
}
