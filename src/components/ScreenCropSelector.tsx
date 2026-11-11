import React, { useEffect, useRef, useState } from 'react';
import { CropRect } from '../types';
import { Crop, Maximize2, PanelBottom, PanelLeft, PanelRight, Smartphone } from 'lucide-react';

interface ScreenCropSelectorProps {
  screenVideo: HTMLVideoElement | null;
  crop: CropRect;
  onChange: (nextCrop: CropRect) => void;
  isActiveRegionMode: boolean;
  onActivateRegionMode?: () => void;
  onDisableScreen?: () => void;
}

type DragMode =
  | null
  | 'move'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se';

export const ScreenCropSelector: React.FC<ScreenCropSelectorProps> = ({
  screenVideo,
  crop,
  onChange,
  isActiveRegionMode,
  onActivateRegionMode,
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

  // Render live miniature preview of the full screen feed
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
            // Subtle grid
            ctx.strokeStyle = '#27272a';
            ctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 40) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, canvas.height);
              ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 40) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(canvas.width, y);
              ctx.stroke();
            }
            ctx.fillStyle = '#71717a';
            ctx.font = '500 13px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(
              'Drag box to choose which portion of your screen to record',
              canvas.width / 2,
              canvas.height / 2
            );
          }
        }
      }
      rafId = requestAnimationFrame(renderPreview);
    };
    rafId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(rafId);
  }, [screenVideo]);

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: DragMode
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (onActivateRegionMode && !isActiveRegionMode) {
      onActivateRegionMode();
    }
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

    let next: CropRect = { ...s };

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

    onChange(next);
  };

  const handlePointerUp = () => {
    setDragMode(null);
    dragStartRef.current = null;
  };

  const applyPreset = (preset: CropRect) => {
    if (onActivateRegionMode && !isActiveRegionMode) {
      onActivateRegionMode();
    }
    onChange(preset);
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crop className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs text-zinc-400">Screen</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-zinc-400">
            {Math.round(crop.width * 100)}% × {Math.round(crop.height * 100)}%
          </span>
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
          className="absolute border-2 border-violet-400 bg-violet-500/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] cursor-move group"
        >
          {/* Rule of thirds subtle grid inside crop box */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
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
            className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-violet-400 rounded-sm border border-zinc-950 cursor-nwse-resize"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'ne')}
            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-violet-400 rounded-sm border border-zinc-950 cursor-nesw-resize"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'sw')}
            className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-violet-400 rounded-sm border border-zinc-950 cursor-nesw-resize"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'se')}
            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-violet-400 rounded-sm border border-zinc-950 cursor-nwse-resize"
          />
        </div>
      </div>

      {/* Quick Region Presets */}
      <div className="grid grid-cols-5 gap-1.5">
        <button
          type="button"
          onClick={() => applyPreset({ x: 0.02, y: 0.04, width: 0.52, height: 0.92 })}
          className="flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700/50 transition"
          title="Left Editor Pane"
        >
          <PanelLeft className="w-3.5 h-3.5 text-violet-400" />
          <span>Left IDE</span>
        </button>
        <button
          type="button"
          onClick={() => applyPreset({ x: 0.46, y: 0.04, width: 0.52, height: 0.92 })}
          className="flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700/50 transition"
          title="Right Split Pane"
        >
          <PanelRight className="w-3.5 h-3.5 text-violet-400" />
          <span>Right</span>
        </button>
        <button
          type="button"
          onClick={() => applyPreset({ x: 0.28, y: 0.02, width: 0.44, height: 0.96 })}
          className="flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700/50 transition"
          title="Center 9:16 Slice"
        >
          <Smartphone className="w-3.5 h-3.5 text-violet-400" />
          <span>9:16 Slice</span>
        </button>
        <button
          type="button"
          onClick={() => applyPreset({ x: 0.05, y: 0.42, width: 0.90, height: 0.54 })}
          className="flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700/50 transition"
          title="Bottom Terminal Area"
        >
          <PanelBottom className="w-3.5 h-3.5 text-violet-400" />
          <span>Terminal</span>
        </button>
        <button
          type="button"
          onClick={() => applyPreset({ x: 0, y: 0, width: 1, height: 1 })}
          className="flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700/50 transition"
          title="Full Screen"
        >
          <Maximize2 className="w-3.5 h-3.5 text-violet-400" />
          <span>Full</span>
        </button>
      </div>
    </div>
  );
};
