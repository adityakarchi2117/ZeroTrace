'use client';

import React, { useEffect, useId, useMemo, useRef } from 'react';
import { Fingerprint, Activity, Lock, Phone, Video } from 'lucide-react';

interface ReflectiveCardProps {
  remoteUsername: string;
  localUsername?: string;
  callType: 'audio' | 'video';
  status: 'calling' | 'ringing' | 'connecting' | 'connected';
  isIncoming: boolean;
  stream?: MediaStream | null;
  blurStrength?: number;
  color?: string;
  metalness?: number;
  roughness?: number;
  overlayColor?: string;
  displacementStrength?: number;
  noiseScale?: number;
  specularConstant?: number;
  grayscale?: number;
  glassDistortion?: number;
  className?: string;
  style?: React.CSSProperties;
}

const statusLabelMap: Record<ReflectiveCardProps['status'], string> = {
  calling: 'Calling...',
  ringing: 'Incoming call...',
  connecting: 'Connecting...',
  connected: 'Connected',
};

const ReflectiveCard: React.FC<ReflectiveCardProps> = ({
  remoteUsername,
  localUsername,
  callType,
  status,
  isIncoming,
  stream = null,
  blurStrength = 12,
  color = 'white',
  metalness = 1,
  roughness = 0.55,
  overlayColor = 'rgba(8, 8, 22, 0.35)',
  displacementStrength = 20,
  noiseScale = 1,
  specularConstant = 2.4,
  grayscale = 0.15,
  glassDistortion = 20,
  className = '',
  style = {},
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const filterId = useId().replace(/:/g, '');

  const hasLiveVideo = useMemo(() => {
    return !!stream?.getVideoTracks().some(track => track.readyState === 'live');
  }, [stream]);

  useEffect(() => {
    if (!videoRef.current || !stream || !hasLiveVideo) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
  }, [stream, hasLiveVideo]);

  const baseFrequency = 0.03 / Math.max(0.1, noiseScale);
  const saturation = 1 - Math.max(0, Math.min(1, grayscale));
  const targetLabel = isIncoming ? 'FROM' : 'TO';

  const cssVariables = {
    '--blur-strength': `${blurStrength}px`,
    '--metalness': metalness,
    '--roughness': roughness,
    '--overlay-color': overlayColor,
    '--text-color': color,
    '--saturation': saturation
  } as React.CSSProperties;

  return (
    <div
      className={`relative w-[320px] h-[500px] max-w-[86vw] max-h-[70vh] rounded-[20px] overflow-hidden bg-[#1a1a1a] shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.1)_inset] isolate ${className}`}
      style={{ ...style, ...cssVariables }}
    >
      <svg className="absolute w-0 h-0 pointer-events-none opacity-0" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="turbulence" baseFrequency={baseFrequency} numOctaves="2" result="noise" />
            <feColorMatrix in="noise" type="luminanceToAlpha" result="noiseAlpha" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={displacementStrength}
              xChannelSelector="R"
              yChannelSelector="G"
              result="rippled"
            />
            <feSpecularLighting
              in="noiseAlpha"
              surfaceScale={displacementStrength}
              specularConstant={specularConstant}
              specularExponent="20"
              lightingColor="#ffffff"
              result="light"
            >
              <fePointLight x="0" y="0" z="300" />
            </feSpecularLighting>
            <feComposite in="light" in2="rippled" operator="in" result="light-effect" />
            <feBlend in="light-effect" in2="rippled" mode="screen" result="metallic-result" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="solidAlpha"
            />
            <feMorphology in="solidAlpha" operator="erode" radius="45" result="erodedAlpha" />
            <feGaussianBlur in="erodedAlpha" stdDeviation="10" result="blurredMap" />
            <feComponentTransfer in="blurredMap" result="glassMap">
              <feFuncA type="linear" slope="0.5" intercept="0" />
            </feComponentTransfer>
            <feDisplacementMap
              in="metallic-result"
              in2="glassMap"
              scale={glassDistortion}
              xChannelSelector="A"
              yChannelSelector="A"
              result="final"
            />
          </filter>
        </defs>
      </svg>

      {hasLiveVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-0 left-0 w-full h-full object-cover scale-[1.15] -scale-x-100 z-0 opacity-90 transition-[filter] duration-300"
          style={{
            filter: `saturate(var(--saturation, 0.85)) contrast(120%) brightness(108%) blur(var(--blur-strength, 12px)) url(#${filterId})`
          }}
        />
      ) : (
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,92,255,0.6),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(59,130,246,0.45),transparent_50%),linear-gradient(160deg,#0b1025_0%,#09091a_45%,#04040a_100%)]" />
      )}

      <div className="absolute inset-0 z-10 opacity-[var(--roughness,0.55)] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%270%200%20200%20200%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cfilter%20id%3D%27noiseFilter%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%270.8%27%20numOctaves%3D%273%27%20stitchTiles%3D%27stitch%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20filter%3D%27url(%23noiseFilter)%27%2F%3E%3C%2Fsvg%3E')] mix-blend-overlay" />
      <div className="absolute inset-0 z-20 bg-[linear-gradient(135deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0.1)_40%,rgba(255,255,255,0)_50%,rgba(255,255,255,0.08)_70%,rgba(255,255,255,0.3)_100%)] pointer-events-none mix-blend-overlay opacity-[var(--metalness,1)]" />
      <div className="absolute inset-0 rounded-[20px] p-[1px] bg-[linear-gradient(135deg,rgba(255,255,255,0.8)_0%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.6)_100%)] [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [mask-composite:exclude] z-20 pointer-events-none" />

      <div className="relative z-30 h-full flex flex-col justify-between p-6 text-[var(--text-color,white)] bg-[var(--overlay-color,rgba(255,255,255,0.05))]">
        <div className="flex justify-between items-center border-b border-white/20 pb-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.1em] px-2 py-1 bg-white/10 rounded border border-white/20">
            <Lock size={14} className="opacity-80" />
            <span>{isIncoming ? 'INCOMING CALL' : 'OUTGOING CALL'}</span>
          </div>
          <div className="flex items-center gap-2 text-white/80">
            {callType === 'video' ? <Video size={18} /> : <Phone size={18} />}
            <Activity className="opacity-80" size={18} />
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center text-center gap-5">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cipher-primary to-cipher-secondary flex items-center justify-center ring-2 ring-white/30 shadow-[0_0_35px_rgba(82,39,255,0.45)]">
            <span className="text-4xl font-bold text-white">{remoteUsername.charAt(0).toUpperCase()}</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-[0.03em] m-0 mb-1 drop-shadow-md">{remoteUsername}</h2>
            <p className="text-xs tracking-[0.16em] opacity-80 m-0 uppercase">{statusLabelMap[status]}</p>
          </div>
        </div>

        <div className="flex justify-between items-end border-t border-white/20 pt-5">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] tracking-[0.12em] opacity-60">{targetLabel}</span>
            <span className="font-mono text-sm tracking-[0.05em] truncate max-w-[180px]">{remoteUsername}</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] tracking-[0.12em] opacity-60 block">YOU</span>
            <span className="font-mono text-xs tracking-[0.05em] opacity-90 block truncate max-w-[110px]">
              {localUsername || 'LOCAL USER'}
            </span>
            <Fingerprint size={22} className="opacity-50 ml-auto mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReflectiveCard;
