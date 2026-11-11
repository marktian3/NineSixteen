import React, { useMemo } from 'react';
import { LAYOUT_META, LayoutPreset, TimelineSegment } from '../types';
import {
  Download,
  Film,
  Loader2,
  Merge,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
} from 'lucide-react';

interface TimelineEditorProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isExporting: boolean;
  exportProgress: number;
  trimStart: number;
  trimEnd: number;
  segments: TimelineSegment[];
  selectedSegmentId: string | null;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSplitAtPlayhead: () => void;
  onDeleteSegmentSplit: (segmentId: string) => void;
  onSelectSegment: (segmentId: string) => void;
  onChangeSegmentLayout: (segmentId: string, layout: LayoutPreset) => void;
  onTrimChange: (start: number, end: number) => void;
  onExportVideo: () => void;
  onDiscardAndNewRecording: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00.0';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const tenths = Math.floor((sec % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

const SEGMENT_COLORS: Record<LayoutPreset, string> = {
  'split-top-cam':
    'bg-violet-600/35 border-violet-400/70 text-violet-100 hover:bg-violet-600/45',
  'circle-bubble':
    'bg-cyan-600/35 border-cyan-400/70 text-cyan-100 hover:bg-cyan-600/45',
};

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  duration,
  currentTime,
  isPlaying,
  isExporting,
  exportProgress,
  trimStart,
  trimEnd,
  segments,
  selectedSegmentId,
  onSeek,
  onTogglePlay,
  onSplitAtPlayhead,
  onDeleteSegmentSplit,
  onSelectSegment,
  onChangeSegmentLayout,
  onTrimChange,
  onExportVideo,
  onDiscardAndNewRecording,
}) => {
  const safeDuration = Math.max(0.5, duration);

  const activeSegment = useMemo(() => {
    return (
      segments.find((s) => s.id === selectedSegmentId) ||
      segments.find((s) => currentTime >= s.startTime && currentTime <= s.endTime) ||
      segments[0]
    );
  }, [segments, selectedSegmentId, currentTime]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isExporting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * safeDuration);
  };

  return (
    <div className="bg-zinc-900/95 border-t border-zinc-800 px-5 py-3.5 flex flex-col gap-3">
      {/* Top Transport & Segment Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={isExporting}
            onClick={onTogglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition shadow-lg shadow-violet-600/25"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <div className="font-mono text-xs bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 rounded-lg text-zinc-200">
            <span className="text-violet-400 font-semibold">{formatTime(currentTime)}</span>
            <span className="text-zinc-600 mx-1.5">/</span>
            <span className="text-zinc-400">{formatTime(safeDuration)}</span>
          </div>

          <div className="h-5 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            disabled={isExporting}
            onClick={onSplitAtPlayhead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium text-zinc-100 border border-zinc-700 transition"
            title="Split segment at playhead so you can switch layout/crop here (Shortcut: S)"
          >
            <Scissors className="w-3.5 h-3.5 text-violet-400" />
            <span>Split at Playhead</span>
            <kbd className="ml-1 px-1.5 py-0.5 text-[10px] bg-zinc-900 text-zinc-400 rounded border border-zinc-700">
              S
            </kbd>
          </button>

          {segments.length > 1 && activeSegment && segments[0].id !== activeSegment.id && (
            <button
              type="button"
              disabled={isExporting}
              onClick={()=>{ onDeleteSegmentSplit(activeSegment.id) }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-xs text-zinc-300 border border-zinc-700/60 transition"
              title="Merge this segment back into the previous segment"
            >
              <Merge className="w-3.5 h-3.5 text-amber-400" />
              <span>Merge Left</span>
            </button>
          )}
        </div>

        {/* Selected Segment Quick Layout Switcher */}
        {activeSegment && (
          <div className="flex items-center gap-1.5 bg-zinc-950/90 border border-zinc-800 px-2.5 py-1 rounded-xl">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 mr-1" />
            <span className="text-[11px] text-zinc-400 mr-1">
              Segment ({formatTime(activeSegment.startTime)}–{formatTime(activeSegment.endTime)}):
            </span>
            {(['split-top-cam', 'circle-bubble'] as LayoutPreset[]).map((preset) => {
              const isSelected = activeSegment.config.layout === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={isExporting}
                  onClick={() => onChangeSegmentLayout(activeSegment.id, preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    isSelected
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  {LAYOUT_META[preset].title}
                </button>
              );
            })}
          </div>
        )}

        {/* Export & New Recording Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isExporting}
            onClick={onDiscardAndNewRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-xs font-medium text-zinc-300 border border-zinc-700/70 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Recording</span>
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={onExportVideo}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-60 text-xs font-semibold text-white shadow-lg shadow-violet-600/25 transition"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Rendering {Math.round(exportProgress * 100)}%...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Export 9:16 Video</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Multi-Track Timeline Scrub Area */}
      <div className="space-y-1.5 select-none">
        {/* Track 1: Non-Destructive Layout & Crop Segments */}
        <div
          onClick={handleTrackClick}
          className="relative h-12 w-full bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden cursor-pointer"
        >
          {/* Dimmed Trim-Out Regions */}
          {trimStart > 0 && (
            <div
              style={{ width: `${(trimStart / safeDuration) * 100}%` }}
              className="absolute inset-y-0 left-0 bg-black/70 z-20 pointer-events-none border-r border-amber-400"
            />
          )}
          {trimEnd < safeDuration && (
            <div
              style={{
                left: `${(trimEnd / safeDuration) * 100}%`,
                width: `${((safeDuration - trimEnd) / safeDuration) * 100}%`,
              }}
              className="absolute inset-y-0 bg-black/70 z-20 pointer-events-none border-l border-amber-400"
            />
          )}

          {/* Segments */}
          {segments.map((seg) => {
            const leftPct = (seg.startTime / safeDuration) * 100;
            const widthPct = Math.max(0.5, ((seg.endTime - seg.startTime) / safeDuration) * 100);
            const isSelected = activeSegment?.id === seg.id;
            const colorClasses = SEGMENT_COLORS[seg.config.layout];

            return (
              <div
                key={seg.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSegment(seg.id);
                  const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                  if (rect && rect.width > 0) {
                    const clickRatio = Math.max(
                      0,
                      Math.min(1, (e.clientX - rect.left) / rect.width)
                    );
                    onSeek(clickRatio * safeDuration);
                  }
                }}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                }}
                className={`absolute inset-y-1 rounded-lg border px-2.5 flex flex-col justify-center transition overflow-hidden ${colorClasses} ${
                  isSelected ? 'ring-2 ring-white/80 z-10' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Film className="w-3 h-3 shrink-0 opacity-80" />
                  <span className="text-[11px] font-semibold truncate">
                    {LAYOUT_META[seg.config.layout].title}
                  </span>
                </div>
                <span className="text-[9px] font-mono opacity-75 truncate">
                  {formatTime(seg.startTime)} – {formatTime(seg.endTime)}
                </span>
              </div>
            );
          })}

          {/* Playhead Indicator */}
          <div
            style={{ left: `${Math.min(100, Math.max(0, (currentTime / safeDuration) * 100))}%` }}
            className="absolute inset-y-0 w-0.5 bg-rose-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.9)]"
          >
            <div className="w-3 h-3 -ml-[5px] -mt-0.5 bg-rose-500 rotate-45 rounded-xs" />
          </div>
        </div>

        {/* Raw Tracks Indicator & Trim Range Controls */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Raw Webcam Track (Synced)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Raw Screen Track (Synced)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5">
              <span className="text-zinc-500">Trim In:</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, trimEnd - 0.5)}
                step={0.1}
                value={Number(trimStart.toFixed(1))}
                onChange={(e) =>
                  onTrimChange(
                    Math.max(0, Math.min(trimEnd - 0.5, parseFloat(e.target.value) || 0)),
                    trimEnd
                  )
                }
                className="w-14 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 font-mono text-zinc-200 text-[11px]"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-zinc-500">Trim Out:</span>
              <input
                type="number"
                min={trimStart + 0.5}
                max={safeDuration}
                step={0.1}
                value={Number(trimEnd.toFixed(1))}
                onChange={(e) =>
                  onTrimChange(
                    trimStart,
                    Math.min(
                      safeDuration,
                      Math.max(trimStart + 0.5, parseFloat(e.target.value) || safeDuration)
                    )
                  )
                }
                className="w-14 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 font-mono text-zinc-200 text-[11px]"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
