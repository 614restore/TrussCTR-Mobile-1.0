import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const PITCHES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12] as const;

function multiplierForRise(rise: number): number {
  return Math.sqrt(rise * rise + 144) / 12;
}

function angleForRise(rise: number): number {
  return (Math.atan(rise / 12) * 180) / Math.PI;
}

function nearestPitch(angleDeg: number): number {
  const rawRise = Math.tan((Math.abs(angleDeg) * Math.PI) / 180) * 12;
  return PITCHES.reduce((prev, curr) =>
    Math.abs(curr - rawRise) < Math.abs(prev - rawRise) ? curr : prev
  );
}

export default function PitchGauge() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const smoothRef = useRef(0);
  const lockedRef = useRef(false);

  const [tiltAngle, setTiltAngle] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockedAngle, setLockedAngle] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionError, setPermissionError] = useState('');

  const displayAngle = locked ? lockedAngle : tiltAngle;
  const currentPitch = nearestPitch(displayAngle);
  const multiplier = multiplierForRise(currentPitch);

  // Start back camera
  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      })
      .catch(() => {
        // Camera unavailable — gauge still works without it
        setCameraReady(false);
      });

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Request motion permission (iOS 13+) and listen to DeviceOrientation
  useEffect(() => {
    const startListening = () => {
      const handler = (e: DeviceOrientationEvent) => {
        if (lockedRef.current) return;
        const beta = e.beta ?? 0;
        smoothRef.current = smoothRef.current * 0.75 + Math.abs(beta) * 0.25;
        setTiltAngle(Math.round(smoothRef.current * 10) / 10);
      };
      window.addEventListener('deviceorientation', handler);
      return handler;
    };

    let handler: ((e: DeviceOrientationEvent) => void) | null = null;

    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      (DeviceOrientationEvent as any)
        .requestPermission()
        .then((result: string) => {
          if (result === 'granted') {
            handler = startListening();
          } else {
            setPermissionError('Motion access denied. Enable in Settings → Privacy → Motion & Fitness.');
          }
        })
        .catch(() => setPermissionError('Could not request motion permission.'));
    } else {
      handler = startListening();
    }

    return () => {
      if (handler) window.removeEventListener('deviceorientation', handler);
    };
  }, []);

  // Draw pitch lines on canvas
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h * 0.42; // slightly above center looks natural

    ctx.clearRect(0, 0, w, h);

    // Draw each pitch line
    PITCHES.forEach((rise) => {
      const angleDeg = angleForRise(rise);
      const isActive = rise === currentPitch;
      const rad = (angleDeg * Math.PI) / 180;
      const lineLen = w * 0.52;
      const dx = lineLen * Math.cos(rad);
      const dy = lineLen * Math.sin(rad);

      // Line
      ctx.beginPath();
      ctx.strokeStyle = isActive ? '#f97316' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = isActive ? 2.5 : 1;
      ctx.setLineDash(isActive ? [] : [6, 5]);
      ctx.moveTo(cx - dx, cy + dy);
      ctx.lineTo(cx + dx, cy - dy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label at right end
      const lx = cx + dx + 6;
      const ly = cy - dy + 4;
      ctx.font = isActive ? 'bold 13px system-ui' : '10px system-ui';
      ctx.fillStyle = isActive ? '#f97316' : 'rgba(255,255,255,0.55)';
      ctx.fillText(`${rise}/12`, lx, ly);
    });

    // Centre crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16); ctx.stroke();
  }, [currentPitch]);

  useEffect(() => {
    const loop = () => {
      drawOverlay();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawOverlay]);

  const handleLock = () => {
    const next = !locked;
    lockedRef.current = next;
    if (next) setLockedAngle(tiltAngle);
    setLocked(next);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      {/* Camera feed */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
        playsInline
        muted
        autoPlay
      />
      {/* Dark fallback when no camera */}
      {!cameraReady && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800" />
      )}

      {/* Pitch-line overlay canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Top gradient + header */}
      <div className="relative z-10 flex items-center gap-3 p-4 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white active:scale-90 transition-transform"
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <p className="text-white font-black text-lg leading-none">Pitch Gauge</p>
          <p className="text-slate-300 text-[10px]">Place phone flat on roof slope</p>
        </div>
        {locked && (
          <div className="ml-auto bg-accent/20 border border-accent/50 px-2 py-1 rounded text-accent text-[10px] font-bold">
            LOCKED
          </div>
        )}
      </div>

      {/* Bottom readout panel */}
      <div className="relative z-10 mt-auto bg-black/85 backdrop-blur-md rounded-t-3xl p-6 space-y-5">
        {permissionError && (
          <p className="text-amber-400 text-xs text-center">{permissionError}</p>
        )}

        {/* Main readout */}
        <div className="flex items-stretch justify-around">
          <div className="text-center">
            <p className="text-slate-400 text-[10px] uppercase font-bold mb-1">Pitch</p>
            <p className="text-white font-black" style={{ fontSize: 44, lineHeight: 1 }}>
              {currentPitch}/12
            </p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-slate-400 text-[10px] uppercase font-bold mb-1">Multiplier</p>
            <p className="text-accent font-black" style={{ fontSize: 44, lineHeight: 1 }}>
              {multiplier.toFixed(3)}
            </p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-slate-400 text-[10px] uppercase font-bold mb-1">Angle</p>
            <p className="text-white font-black" style={{ fontSize: 44, lineHeight: 1 }}>
              {displayAngle.toFixed(1)}°
            </p>
          </div>
        </div>

        {/* All pitches quick reference */}
        <div className="grid grid-cols-5 gap-1.5">
          {PITCHES.map((r) => (
            <div
              key={r}
              className={`rounded-lg p-2 text-center transition-colors ${
                r === currentPitch
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-slate-400'
              }`}
            >
              <p className="text-[10px] font-bold">{r}/12</p>
              <p className="text-[9px] opacity-70">{multiplierForRise(r).toFixed(3)}</p>
            </div>
          ))}
        </div>

        {/* Lock button */}
        <button
          onClick={handleLock}
          className={`w-full py-4 rounded-2xl font-black text-sm transition-colors active:scale-95 ${
            locked
              ? 'bg-accent text-white'
              : 'bg-white/10 text-white'
          }`}
        >
          {locked ? '🔒 Locked — Tap to Unlock' : 'Lock Reading'}
        </button>
      </div>
    </div>
  );
}
