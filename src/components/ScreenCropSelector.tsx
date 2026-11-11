import React, { useEffect, useRef, useState } from 'react';
import { CropRect, SegmentConfig } from '../types';
import { Maximize2, Monitor, PanelBottom, PanelLeft, PanelRight, Smartphone } from 'lucide-react';

interface ScreenCropSelectorProps {
  screenVideo: HTMLVideoElement | null;
  crop: CropRect;
  fitMode: SegmentConfig['screenFitMode'];
  isDemo?: boolean;
  onChangeCrop: (nextCrop: CropRect) => void;
  onChangeFitMode: (nextFit: SegmentConfig['screenFitMode']) => void;
  onConnectRealScreen?: () => void;
  onDisableScreen?: () => void;
}

type DragMode = null | 'move' | 'nw' | 'ne' | 'sw' | 'se';

const PRESETS: { label: string; icon: React.FC<{ className?: string }>; rect: CropRect }[] = [
  { label: 'Full', icon: Maximize2, rect: { x: 0, y: 0, width: 1, height: 1 } },
  { label: '9:16 Slice', icon: Smartphone, rect: { x: 0.28, y: 0.02, width: 0.44, height: 0.96 } },
  { label: 'Left IDE', icon: PanelLeft, rect: { x: 0.02, y: 0.04, width: 0.52, height: 0.92 } },
  { label: 'Right', icon: PanelRight, rect: { x: 0.46, y: 0.04, width: 0.52, height: 0.92 } },
  { label: 'Terminal', icon: PanelBottom, rect: { x: 0.05, y: 0.42, width: 0.9, height: 0.54 } },
];

function isSameRect(a: CropRect, b: CropRect): boolean {
  return (
    Math.abs(a.x - b.x) < 0.02 &&
    Math.abs(a.y - b.y) < 0.02 &&
    Math.abs(a.width - b.width) < 0.02 &&
    Math.abs(a.height - b.height) < 0.02
  );
}

export const ScreenCropSelector: React.FC<ScreenCropSelectorProps> = ({
  screenVideo,
  crop,
  fitMode,
  isDemo,
  onChangeCrop,
  onChangeFitMode,
  onConnectRealScreen,
  onDisableScreen,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startCrop: CropRect;
  } | null>(null);

  useEffect(() => {
    let rafId = 0;
    const renderPreview = () => {
      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (screenVideo && screenVideo.videoWidth > 0) {
            ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.fillStyle = '#18181b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        }
      }
      rafId = requestAnimationFrame(renderPreview);
    };
    rafId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(rafId);
  }, [screenVideo]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragMode(mode);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startCrop: { ...crop },
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode || !dragStartRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dx = (e.clientX - dragStartRef.current.mouseX) / rect.width;
    const dy = (e.clientY - dragStartRef.current.mouseY) / rect.height;
    const s = dragStartRef.current.startCrop;
    const minSize = 0.12;

    const next: CropRect = { ...s };

    if (dragMode === 'move') {
      next.x = Math.max(0, Math.min(1 - s.width, s.x + dx));
      next.y = Math.max(0, Math.min(1 - s.height, s.y + dy));
    } else if (dragMode === 'se') {
      next.width = Math.max(minSize, Math.min(1 - s.x, s.width + dx));
      next.height = Math.max(minSize, Math.min(1 - s.y, s.height + dy));
    } else if (dragMode === 'nw') {
      const maxDx = s.width - minSize;
      const maxDy = s.height - minSize;
      const clampedDx = Math.max(-s.x, Math.min(maxDx, dx));
      const clampedDy = Math.max(-s.y, Math.min(maxDy, dy));
      next.x = s.x + clampedDx;
      next.y = s.y + clampedDy;
      next.width = s.width - clampedDx;
      next.height = s.height - clampedDy;
    } else if (dragMode === 'ne') {
      const maxDy = s.height - minSize;
      const clampedDy = Math.max(-s.y, Math.min(maxDy, dy));
      next.y = s.y + clampedDy;
      next.height = s.height - clampedDy;
      next.width = Math.max(minSize, Math.min(1 - s.x, s.width + dx));
    } else if (dragMode === 'sw') {
      const maxDx = s.width - minSize;
      const clampedDx = Math.max(-s.x, Math.min(maxDx, dx));
      next.x = s.x + clampedDx;
      next.width = s.width - clampedDx;
      next.height = Math.max(minSize, Math.min(1 - s.y, s.height + dy));
    }

    onChangeCrop(next);
  };

  const handlePointerUp = () => {
    setDragMode(null);
    dragStartRef.current = null;
  };

  return (
    <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 space-y-2.5">
      {/* Header Row: Title + Fit/Fill Toggle + Share/Off Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Screen</span>
          {isDemo && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
              Demo
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Fit vs Fill Toggle */}
          <div className="flex bg-zinc-950 rounded-md p-0.5 border border-zinc-800">
            {(
              [
                { id: 'contain-card', label: 'Fit' },
                { id: 'cover-center', label: 'Fill' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeFitMode(opt.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  fitMode === opt.id
                    ? 'bg-violet-600/30 text-violet-200'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {isDemo && onConnectRealScreen && (
            <button
              type="button"
              onClick={onConnectRealScreen}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 border border-violet-500/40 transition cursor-pointer"
              title="Share your real screen or window"
            >
              <Monitor className="w-3 h-3" />
              <span>Share</span>
            </button>
          )}

          {!isDemo && onDisableScreen && (
            <button
              type="button"
              onClick={onDisableScreen}
              className="px-2 py-0.5 rounded text-[11px] bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition cursor-pointer"
            >
              Off
            </button>
          )}
        </div>
      </div>

      {/* Interactive Widescreen Monitor Map */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-full aspect-video bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 select-none"
      >
        <canvas
          ref={previewCanvasRef}
          width={480}
          height={270}
          className="w-full h-full object-cover"
        />

        {/* Dimmed outside overlay */}
        <div className="absolute inset-0 bg-black/55 pointer-events-none" />

        {/* Active Crop Box */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'move')}
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.width * 100}%`,
            height: `${crop.height * 100}%`,
          }}
          className="absolute border-2 border-violet-400 bg-violet-500/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] cursor-move"
        >
          {/* Subtle rule-of-thirds grid */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-35">
            <div className="border-r border-b border-violet-300/30" />
            <div className="border-r border-b border-violet-300/30" />
            <div className="border-b border-violet-300/30" />
            <div className="border-r border-b border-violet-300/30" />
            <div className="border-r border-b border-violet-300/30" />
            <div className="border-b border-violet-300/30" />
          </div>

          {/* Corner Resize Handles */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'nw')}
            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-violet-400 rounded-xs border border-zinc-950 cursor-nwse-resize"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'ne')}
            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-violet-400 rounded-xs border border-zinc-950 cursor-nesw-resize"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'sw')}
            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-violet-400 rounded-xs border border-zinc-950 cursor-nesw-resize"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'se')}
            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-violet-400 rounded-xs border border-zinc-950 cursor-nwse-resize"
          />
        </div>
      </div>

      {/* Unified Quick Region Presets */}
      <div className="grid grid-cols-5 gap-1">
        {PRESETS.map((p) => {
          const Icon = p.icon;
          const active = isSameRect(crop, p.rect);
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChangeCrop(p.rect)}
              className={`flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg text-[10px] border transition cursor-pointer ${
                active
                  ? 'bg-violet-600/25 border-violet-500 text-white'
                  : 'bg-zinc-950/70 hover:bg-zinc-800 text-zinc-400 border-zinc-800/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5 text-violet-400" />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
