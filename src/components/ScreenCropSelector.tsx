import React, { useEffect, useRef, useState } from 'react';
import { CropRect, LayoutPreset } from '../types';
import { Maximize2, Monitor, Smartphone } from 'lucide-react';

interface ScreenCropSelectorProps {
  screenVideo: HTMLVideoElement | null;
  crop: CropRect;
  layout: LayoutPreset;
  splitRatio: number;
  isDemo?: boolean;
  onChangeCrop: (nextCrop: CropRect) => void;
  onConnectRealScreen?: () => void;
  onDisableScreen?: () => void;
}

type DragMode = null | 'move' | 'nw' | 'ne' | 'sw' | 'se';

function isSameRect(a: CropRect, b: CropRect): boolean {
  return (
    Math.abs(a.x - b.x) < 0.03 &&
    Math.abs(a.y - b.y) < 0.03 &&
    Math.abs(a.width - b.width) < 0.03 &&
    Math.abs(a.height - b.height) < 0.03
  );
}

export const ScreenCropSelector: React.FC<ScreenCropSelectorProps> = ({
  screenVideo,
  crop,
  layout,
  splitRatio,
  isDemo,
  onChangeCrop,
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

  // Calculate exact crop box that fills the vertical destination frame edge-to-edge
  const srcAspect =
    screenVideo && screenVideo.videoWidth > 0 && screenVideo.videoHeight > 0
      ? screenVideo.videoWidth / screenVideo.videoHeight
      : 16 / 9;

  const destSlotAspect =
    layout === 'split-top-cam'
      ? 1080 / (1920 * (1 - Math.max(0.15, Math.min(0.65, splitRatio || 0.3))))
      : 1080 / 1920;

  const fillWidth = Math.min(1, Math.max(0.2, destSlotAspect / srcAspect));
  const fillRect: CropRect = {
    x: Number(((1 - fillWidth) / 2).toFixed(3)),
    y: 0,
    width: Number(fillWidth.toFixed(3)),
    height: 1,
  };
  const fullRect: CropRect = { x: 0, y: 0, width: 1, height: 1 };

  const isFullActive = isSameRect(crop, fullRect);
  const isFillActive =
    Math.abs(crop.width - fillRect.width) < 0.04 && Math.abs(crop.height - 1) < 0.04;

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
      {/* Top Action / Header Row */}
      {isDemo && onConnectRealScreen ? (
        <button
          type="button"
          onClick={onConnectRealScreen}
          className="w-full py-2 px-3 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-100 flex items-center justify-center gap-2 text-xs font-medium transition cursor-pointer"
        >
          <Monitor className="w-3.5 h-3.5 text-violet-400" />
          <span>Select Screen / Window</span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-400">Screen</span>
          <div className="flex items-center gap-1.5">
            {onConnectRealScreen && (
              <button
                type="button"
                onClick={onConnectRealScreen}
                className="px-2 py-0.5 rounded text-[11px] bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition cursor-pointer"
              >
                Change
              </button>
            )}
            {onDisableScreen && (
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
      )}

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

      {/* Two Clean Presets: Full (Fit) & Fill (Vertical Slice) */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onChangeCrop(fullRect)}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium border transition cursor-pointer ${
            isFullActive
              ? 'bg-violet-600/25 border-violet-500 text-white'
              : 'bg-zinc-950/70 hover:bg-zinc-800 text-zinc-400 border-zinc-800/80'
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5 text-violet-400" />
          <span>Full</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeCrop(fillRect)}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium border transition cursor-pointer ${
            isFillActive && !isFullActive
              ? 'bg-violet-600/25 border-violet-500 text-white'
              : 'bg-zinc-950/70 hover:bg-zinc-800 text-zinc-400 border-zinc-800/80'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-violet-400" />
          <span>Fill</span>
        </button>
      </div>
    </div>
  );
};
