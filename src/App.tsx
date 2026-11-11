import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackgroundStyle,
  CropRect,
  DEFAULT_SEGMENT_CONFIG,
  LAYOUT_META,
  LayoutPreset,
  SegmentConfig,
  TimelineSegment,
} from './types';
import { CANVAS_HEIGHT, CANVAS_WIDTH, renderCompositeFrame } from './compositor';
import { ScreenCropSelector } from './components/ScreenCropSelector';
import { TimelineEditor } from './components/TimelineEditor';
import { createDemoStreams, DemoStreamsController } from './demoStreams';
import {
  AlertCircle,
  Camera,
  CircleDot,
  Download,
  FlipHorizontal,
  Monitor,
  Square,
  Wand2,
} from 'lucide-react';

type StudioMode = 'live' | 'edit';

/**
 * Safely creates a MediaRecorder for a given MediaStream, choosing a compatible
 * codec based on whether the stream includes audio tracks, and falling back to
 * the browser's default MediaRecorder config if a specific codec is rejected.
 */
function createSafeRecorder(
  stream: MediaStream,
  videoBitsPerSecond = 8_000_000
): { recorder: MediaRecorder; mimeType: string; ext: string } {
  const hasAudio = stream.getAudioTracks().some((t) => t.readyState === 'live');

  const candidates = hasAudio
    ? [
        { mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
        { mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
        { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
        { mimeType: 'video/mp4', ext: 'mp4' },
        { mimeType: 'video/webm', ext: 'webm' },
      ]
    : [
        { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
        { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
        { mimeType: 'video/mp4;codecs=avc1', ext: 'mp4' },
        { mimeType: 'video/mp4', ext: 'mp4' },
        { mimeType: 'video/webm', ext: 'webm' },
      ];

  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      try {
        const recorder = new MediaRecorder(stream, {
          mimeType: c.mimeType,
          videoBitsPerSecond,
        });
        return { recorder, mimeType: c.mimeType, ext: c.ext };
      } catch {
        // Continue to next candidate
      }
    }
  }

  // Fallback to default browser MediaRecorder with no options
  const fallbackRecorder = new MediaRecorder(stream);
  const actualMime = fallbackRecorder.mimeType || 'video/webm';
  const ext = actualMime.includes('mp4') ? 'mp4' : 'webm';
  return { recorder: fallbackRecorder, mimeType: actualMime, ext };
}

function isStreamLive(stream: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.active && stream.getVideoTracks().some((t) => t.readyState === 'live');
}

export function App() {
  // Studio mode: 'live' (setup & recording) vs 'edit' (post-recording non-destructive timeline)
  const [mode, setMode] = useState<StudioMode>('live');

  // Active configuration in live mode
  const [liveConfig, setLiveConfig] = useState<SegmentConfig>(DEFAULT_SEGMENT_CONFIG);

  // Live capture states
  const [hasScreen, setHasScreen] = useState(false);
  const [hasCam, setHasCam] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamId, setSelectedCamId] = useState<string>('');
  const [isDemoActive, setIsDemoActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Post-recording raw track URLs & timeline segments
  const [rawScreenUrl, setRawScreenUrl] = useState<string | null>(null);
  const [rawCamUrl, setRawCamUrl] = useState<string | null>(null);
  const [instantCompositeUrl, setInstantCompositeUrl] = useState<string | null>(null);
  const [recordedExt, setRecordedExt] = useState<string>('webm');

  const [segments, setSegments] = useState<TimelineSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Hidden video elements for live streams and recorded playback
  const liveScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveCamVideoRef = useRef<HTMLVideoElement | null>(null);
  const editScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const editCamVideoRef = useRef<HTMLVideoElement | null>(null);

  // Main 9:16 composite canvas (1080x1920)
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // MediaStreams & Recorders
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const demoControllerRef = useRef<DemoStreamsController | null>(null);

  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const camRecorderRef = useRef<MediaRecorder | null>(null);
  const compositeRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStartPerfRef = useRef<number>(0);
  const recordedSegmentsLogRef = useRef<TimelineSegment[]>([]);

  // Interactive canvas drag state (bubble move or split ratio drag)
  const canvasDragRef = useRef<{
    type: 'bubble' | 'split' | null;
    offsetX: number;
    offsetY: number;
  }>({ type: null, offsetX: 0, offsetY: 0 });

  // Determine the currently active SegmentConfig (either liveConfig or the active timeline segment)
  const activeEditSegment = useMemo(() => {
    if (mode !== 'edit' || segments.length === 0) return null;
    return (
      segments.find((s) => s.id === selectedSegmentId) ||
      segments.find((s) => currentTime >= s.startTime && currentTime <= s.endTime) ||
      segments[0]
    );
  }, [mode, segments, selectedSegmentId, currentTime]);

  const currentConfig: SegmentConfig = useMemo(() => {
    if (mode === 'edit' && activeEditSegment) {
      return activeEditSegment.config;
    }
    return liveConfig;
  }, [mode, activeEditSegment, liveConfig]);

  // Update config helper
  const updateConfig = useCallback(
    (updater: (prev: SegmentConfig) => SegmentConfig) => {
      if (mode === 'edit') {
        setSegments((prevSegments) => {
          const targetId =
            selectedSegmentId ||
            prevSegments.find((s) => currentTime >= s.startTime && currentTime <= s.endTime)?.id ||
            prevSegments[0]?.id;
          if (!targetId) return prevSegments;
          return prevSegments.map((seg) =>
            seg.id === targetId ? { ...seg, config: updater(seg.config) } : seg
          );
        });
      } else {
        setLiveConfig((prev) => {
          const next = updater(prev);
          if (isRecording && recordedSegmentsLogRef.current.length > 0) {
            const elapsed = (performance.now() - recordStartPerfRef.current) / 1000;
            const log = recordedSegmentsLogRef.current;
            const last = log[log.length - 1];
            if (last.config.layout !== next.layout && elapsed - last.startTime > 0.4) {
              last.endTime = elapsed;
              log.push({
                id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                startTime: elapsed,
                endTime: elapsed + 0.1,
                config: structuredClone(next),
              });
            } else {
              last.config = structuredClone(next);
            }
          }
          return next;
        });
      }
    },
    [mode, selectedSegmentId, currentTime, isRecording]
  );

  // Stop demo streams if running
  const stopDemoIfActive = useCallback(() => {
    if (demoControllerRef.current) {
      demoControllerRef.current.stop();
      demoControllerRef.current = null;
      setIsDemoActive(false);
    }
  }, []);

  // Synchronously initialize and play Demo Feeds
  const activateDemoFeeds = useCallback(() => {
    if (demoControllerRef.current) {
      demoControllerRef.current.stop();
      demoControllerRef.current = null;
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current?.getTracks().forEach((t) => t.stop());

    const demo = createDemoStreams();
    demoControllerRef.current = demo;
    screenStreamRef.current = demo.screenStream;
    camStreamRef.current = demo.camStream;

    if (liveScreenVideoRef.current) {
      liveScreenVideoRef.current.srcObject = demo.screenStream;
      liveScreenVideoRef.current.play().catch(() => {});
    }
    if (liveCamVideoRef.current) {
      liveCamVideoRef.current.srcObject = demo.camStream;
      liveCamVideoRef.current.play().catch(() => {});
    }

    setIsDemoActive(true);
    setHasScreen(true);
    setHasCam(true);
  }, []);

  // Auto-load demo feeds on mount (StrictMode-safe)
  useEffect(() => {
    activateDemoFeeds();
    return () => {
      if (demoControllerRef.current) {
        demoControllerRef.current.stop();
        demoControllerRef.current = null;
      }
    };
  }, [activateDemoFeeds]);

  // Start/Stop Screen Share
  const handleToggleScreen = async () => {
    setErrorBanner(null);
    if (hasScreen && !isDemoActive) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      if (liveScreenVideoRef.current) liveScreenVideoRef.current.srcObject = null;
      setHasScreen(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
        },
        audio: true,
      });

      if (isDemoActive) {
        stopDemoIfActive();
        setHasCam(false);
        camStreamRef.current = null;
        if (liveCamVideoRef.current) liveCamVideoRef.current.srcObject = null;
      }

      screenStreamRef.current = stream;
      if (liveScreenVideoRef.current) {
        liveScreenVideoRef.current.srcObject = stream;
        await liveScreenVideoRef.current.play().catch(() => {});
      }
      setHasScreen(true);

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setHasScreen(false);
        screenStreamRef.current = null;
      });
    } catch (err) {
      console.warn('Screen selection cancelled or failed:', err);
    }
  };

  // Enumerate available video input devices (MacBook FaceTime HD, iPhone Continuity Camera, etc.)
  const refreshCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setCameraDevices(videoInputs);
    } catch {
      // Ignore enumeration errors before permission grant
    }
  }, []);

  useEffect(() => {
    refreshCameraDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshCameraDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshCameraDevices);
    };
  }, [refreshCameraDevices]);

  const startCameraStream = async (deviceId?: string) => {
    setErrorBanner(null);
    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60 },
      };
      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      if (isDemoActive) {
        stopDemoIfActive();
        setHasScreen(false);
        screenStreamRef.current = null;
        if (liveScreenVideoRef.current) liveScreenVideoRef.current.srcObject = null;
      }

      // Stop previous camera stream tracks if switching cameras
      camStreamRef.current?.getTracks().forEach((t) => t.stop());

      camStreamRef.current = stream;
      if (liveCamVideoRef.current) {
        liveCamVideoRef.current.srcObject = stream;
        await liveCamVideoRef.current.play().catch(() => {});
      }

      const activeDeviceId = stream.getVideoTracks()[0]?.getSettings()?.deviceId || deviceId || '';
      setSelectedCamId(activeDeviceId);
      setHasCam(true);
      await refreshCameraDevices();
    } catch (err) {
      console.warn('Webcam selection cancelled or failed:', err);
      setErrorBanner('Could not access camera/microphone. Check browser permissions.');
    }
  };

  // Start/Stop Webcam + Mic
  const handleToggleCam = async () => {
    setErrorBanner(null);
    if (hasCam && !isDemoActive) {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      if (liveCamVideoRef.current) liveCamVideoRef.current.srcObject = null;
      setHasCam(false);
      return;
    }

    await startCameraStream(selectedCamId || undefined);
  };

  // Toggle Synthetic Demo Feeds
  const handleToggleDemoFeeds = () => {
    setErrorBanner(null);
    if (isDemoActive) {
      stopDemoIfActive();
      screenStreamRef.current = null;
      camStreamRef.current = null;
      if (liveScreenVideoRef.current) liveScreenVideoRef.current.srcObject = null;
      if (liveCamVideoRef.current) liveCamVideoRef.current.srcObject = null;
      setHasScreen(false);
      setHasCam(false);
      return;
    }
    activateDemoFeeds();
    setMode('live');
  };

  // Main 60fps 9:16 Canvas Render Loop
  useEffect(() => {
    let rafId = 0;

    const renderLoop = () => {
      const canvas = compositeCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (mode === 'live') {
            renderCompositeFrame(
              ctx,
              CANVAS_WIDTH,
              CANVAS_HEIGHT,
              hasScreen ? liveScreenVideoRef.current : null,
              hasCam ? liveCamVideoRef.current : null,
              liveConfig
            );
          } else {
            const sVid = editScreenVideoRef.current;
            const cVid = editCamVideoRef.current;
            const t = sVid?.currentTime || cVid?.currentTime || currentTime;
            const seg =
              segments.find((s) => t >= s.startTime && t <= s.endTime) ||
              segments[segments.length - 1] || {
                config: liveConfig,
              };
            renderCompositeFrame(
              ctx,
              CANVAS_WIDTH,
              CANVAS_HEIGHT,
              sVid && sVid.readyState >= 2 ? sVid : null,
              cVid && cVid.readyState >= 2 ? cVid : null,
              seg.config
            );
          }
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [mode, hasScreen, hasCam, liveConfig, segments, currentTime]);

  // Recording elapsed timer
  useEffect(() => {
    if (!isRecording) return;
    const interval = window.setInterval(() => {
      setRecordingSeconds((performance.now() - recordStartPerfRef.current) / 1000);
    }, 100);
    return () => window.clearInterval(interval);
  }, [isRecording]);

  // Start Dual-Track + Live Composite Recording
  const handleStartRecording = async () => {
    try {
      setErrorBanner(null);

      // Ensure at least one stream is live; if neither is live, activate demo feeds
      if (!isStreamLive(screenStreamRef.current) && !isStreamLive(camStreamRef.current)) {
        activateDemoFeeds();
      }

      const screenChunks: BlobPart[] = [];
      const camChunks: BlobPart[] = [];
      const compositeChunks: BlobPart[] = [];

      let screenMime = 'video/webm';
      let camMime = 'video/webm';
      let compMime = 'video/webm';
      let compExt = 'webm';

      recordStartPerfRef.current = performance.now();
      setRecordingSeconds(0);
      recordedSegmentsLogRef.current = [
        {
          id: `seg-${Date.now()}`,
          startTime: 0,
          endTime: 0,
          config: structuredClone(liveConfig),
        },
      ];

      let pendingStops = 0;
      let totalDurationSec = 0;

      const finalizeRecording = () => {
        pendingStops -= 1;
        if (pendingStops > 0) return;

        const finalDuration = Math.max(0.8, totalDurationSec);
        const finalSegments = recordedSegmentsLogRef.current.map((s, idx, arr) =>
          idx === arr.length - 1 ? { ...s, endTime: finalDuration } : s
        );

        if (screenChunks.length > 0) {
          const sBlob = new Blob(screenChunks, { type: screenMime });
          setRawScreenUrl(URL.createObjectURL(sBlob));
        } else {
          setRawScreenUrl(null);
        }

        if (camChunks.length > 0) {
          const cBlob = new Blob(camChunks, { type: camMime });
          setRawCamUrl(URL.createObjectURL(cBlob));
        } else {
          setRawCamUrl(null);
        }

        if (compositeChunks.length > 0) {
          const compBlob = new Blob(compositeChunks, { type: compMime });
          setInstantCompositeUrl(URL.createObjectURL(compBlob));
        }

        setRecordedExt(compExt);
        setDuration(finalDuration);
        setTrimStart(0);
        setTrimEnd(finalDuration);
        setCurrentTime(0);
        setSegments(finalSegments);
        setSelectedSegmentId(finalSegments[0]?.id || null);
        setMode('edit');
      };

      // 1. Raw Screen Track Recorder
      if (isStreamLive(screenStreamRef.current) && screenStreamRef.current) {
        const { recorder: sRec, mimeType } = createSafeRecorder(screenStreamRef.current);
        screenMime = mimeType;
        pendingStops += 1;
        sRec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) screenChunks.push(e.data);
        };
        sRec.onstop = finalizeRecording;
        sRec.start(200);
        screenRecorderRef.current = sRec;
      }

      // 2. Raw Camera + Mic Track Recorder
      if (isStreamLive(camStreamRef.current) && camStreamRef.current) {
        const { recorder: cRec, mimeType } = createSafeRecorder(camStreamRef.current);
        camMime = mimeType;
        pendingStops += 1;
        cRec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) camChunks.push(e.data);
        };
        cRec.onstop = finalizeRecording;
        cRec.start(200);
        camRecorderRef.current = cRec;
      }

      // 3. Live Composite 9:16 Canvas Recorder (for instant 0-wait download option)
      if (compositeCanvasRef.current) {
        const canvasStream = compositeCanvasRef.current.captureStream(30);
        const liveAudioTracks = [
          ...(camStreamRef.current?.getAudioTracks() || []),
          ...(screenStreamRef.current?.getAudioTracks() || []),
        ].filter((t) => t.readyState === 'live');

        if (liveAudioTracks.length > 0) {
          canvasStream.addTrack(liveAudioTracks[0]);
        }

        const { recorder: compRec, mimeType, ext } = createSafeRecorder(canvasStream);
        compMime = mimeType;
        compExt = ext;
        pendingStops += 1;

        compRec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) compositeChunks.push(e.data);
        };
        compRec.onstop = () => {
          totalDurationSec = (performance.now() - recordStartPerfRef.current) / 1000;
          finalizeRecording();
        };
        compRec.start(200);
        compositeRecorderRef.current = compRec;
      }

      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setErrorBanner(
        err instanceof Error
          ? `Recording failed to start: ${err.message}`
          : 'Recording failed to start.'
      );
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    [screenRecorderRef, camRecorderRef, compositeRecorderRef].forEach((ref) => {
      try {
        if (ref.current && ref.current.state !== 'inactive') {
          ref.current.stop();
        }
      } catch (err) {
        console.warn('Error stopping recorder:', err);
      }
      ref.current = null;
    });
  };

  // Synchronized Dual-Track Playback in Edit Mode
  useEffect(() => {
    if (mode !== 'edit') return;
    let rafId = 0;

    const syncClock = () => {
      const primary = editScreenVideoRef.current || editCamVideoRef.current;
      if (primary && !primary.paused) {
        const t = primary.currentTime;
        setCurrentTime(t);
        if (t >= trimEnd) {
          editScreenVideoRef.current?.pause();
          editCamVideoRef.current?.pause();
          if (editScreenVideoRef.current) editScreenVideoRef.current.currentTime = trimStart;
          if (editCamVideoRef.current) editCamVideoRef.current.currentTime = trimStart;
          setCurrentTime(trimStart);
          setIsPlaying(false);
        }
      }
      rafId = requestAnimationFrame(syncClock);
    };

    rafId = requestAnimationFrame(syncClock);
    return () => cancelAnimationFrame(rafId);
  }, [mode, trimStart, trimEnd]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(duration || 100, time));
      setCurrentTime(clamped);
      if (editScreenVideoRef.current) editScreenVideoRef.current.currentTime = clamped;
      if (editCamVideoRef.current) editCamVideoRef.current.currentTime = clamped;
    },
    [duration]
  );

  const handleTogglePlay = useCallback(async () => {
    if (mode !== 'edit') return;
    if (isPlaying) {
      editScreenVideoRef.current?.pause();
      editCamVideoRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (currentTime >= trimEnd - 0.1 || currentTime < trimStart) {
        handleSeek(trimStart);
      }
      await Promise.all([
        editScreenVideoRef.current?.play().catch(() => {}),
        editCamVideoRef.current?.play().catch(() => {}),
      ]);
      setIsPlaying(true);
    }
  }, [mode, isPlaying, currentTime, trimStart, trimEnd, handleSeek]);

  // Split segment at current playhead (Post-recording non-destructive edit)
  const handleSplitAtPlayhead = useCallback(() => {
    if (mode !== 'edit') return;
    const splitTime = currentTime;
    setSegments((prev) => {
      const idx = prev.findIndex(
        (s) => splitTime > s.startTime + 0.2 && splitTime < s.endTime - 0.2
      );
      if (idx === -1) return prev;
      const target = prev[idx];
      const firstHalf: TimelineSegment = {
        ...target,
        endTime: splitTime,
      };
      const secondHalf: TimelineSegment = {
        id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        startTime: splitTime,
        endTime: target.endTime,
        config: structuredClone(target.config),
      };
      setSelectedSegmentId(secondHalf.id);
      const next = [...prev];
      next.splice(idx, 1, firstHalf, secondHalf);
      return next;
    });
  }, [mode, currentTime]);

  const handleDeleteSegmentSplit = useCallback((segmentId: string) => {
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === segmentId);
      if (idx <= 0) return prev;
      const mergedPrev: TimelineSegment = {
        ...prev[idx - 1],
        endTime: prev[idx].endTime,
      };
      const next = [...prev];
      next.splice(idx - 1, 2, mergedPrev);
      setSelectedSegmentId(mergedPrev.id);
      return next;
    });
  }, []);

  // Export Post-Edited Timeline to 1080x1920 Video
  const handleExportEditedVideo = async () => {
    if (!compositeCanvasRef.current || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);

    editScreenVideoRef.current?.pause();
    editCamVideoRef.current?.pause();
    setIsPlaying(false);

    handleSeek(trimStart);
    await new Promise((r) => setTimeout(r, 150));

    const stream = compositeCanvasRef.current.captureStream(30);

    // Capture audio track from recorded camera/screen video if available
    try {
      const cVid = editCamVideoRef.current as HTMLVideoElement & {
        captureStream?: () => MediaStream;
      };
      if (cVid && typeof cVid.captureStream === 'function') {
        const cStream = cVid.captureStream();
        cStream
          .getAudioTracks()
          .filter((t) => t.readyState === 'live')
          .forEach((t) => stream.addTrack(t));
      }
    } catch {
      // Audio capture fallback ignored if not present
    }

    const chunks: BlobPart[] = [];
    const { recorder, mimeType, ext } = createSafeRecorder(stream, 10_000_000);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const exportPromise = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NineSixteen-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
        a.click();
        resolve();
      };
    });

    recorder.start(100);
    await Promise.all([
      editScreenVideoRef.current?.play().catch(() => {}),
      editCamVideoRef.current?.play().catch(() => {}),
    ]);

    const exportLen = Math.max(0.5, trimEnd - trimStart);
    const checkInterval = window.setInterval(() => {
      const primary = editScreenVideoRef.current || editCamVideoRef.current;
      const t = primary?.currentTime ?? trimEnd;
      const prog = Math.min(1, Math.max(0, (t - trimStart) / exportLen));
      setExportProgress(prog);

      if (t >= trimEnd || primary?.ended) {
        window.clearInterval(checkInterval);
        editScreenVideoRef.current?.pause();
        editCamVideoRef.current?.pause();
        if (recorder.state !== 'inactive') recorder.stop();
      }
    }, 50);

    await exportPromise;
    setIsExporting(false);
    setExportProgress(0);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '1') {
        updateConfig((c) => ({ ...c, layout: 'split-top-cam' }));
      } else if (e.key === '2') {
        updateConfig((c) => ({ ...c, layout: 'circle-bubble' }));
      } else if (e.key === ' ' && mode === 'edit') {
        e.preventDefault();
        handleTogglePlay();
      } else if ((e.key === 's' || e.key === 'S') && mode === 'edit') {
        e.preventDefault();
        handleSplitAtPlayhead();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, updateConfig, handleTogglePlay, handleSplitAtPlayhead]);

  // Direct 9:16 Canvas Interaction
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    const isBubbleActive = currentConfig.layout === 'circle-bubble';

    if (isBubbleActive) {
      const dx = normX - currentConfig.bubbleX;
      const dy = (normY - currentConfig.bubbleY) * (CANVAS_HEIGHT / CANVAS_WIDTH);
      const dist = Math.hypot(dx, dy);
      if (dist <= currentConfig.bubbleRadius * 1.25) {
        e.currentTarget.setPointerCapture(e.pointerId);
        canvasDragRef.current = {
          type: 'bubble',
          offsetX: normX - currentConfig.bubbleX,
          offsetY: normY - currentConfig.bubbleY,
        };
        return;
      }
    } else {
      if (Math.abs(normY - currentConfig.splitRatio) < 0.05) {
        e.currentTarget.setPointerCapture(e.pointerId);
        canvasDragRef.current = {
          type: 'split',
          offsetX: 0,
          offsetY: 0,
        };
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasDragRef.current.type || !compositeCanvasRef.current) return;
    const rect = compositeCanvasRef.current.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    if (canvasDragRef.current.type === 'bubble') {
      const r = currentConfig.bubbleRadius;
      const rY = (r * CANVAS_WIDTH) / CANVAS_HEIGHT;
      const nextX = Math.max(
        r + 0.02,
        Math.min(1 - r - 0.02, normX - canvasDragRef.current.offsetX)
      );
      const nextY = Math.max(
        rY + 0.02,
        Math.min(1 - rY - 0.02, normY - canvasDragRef.current.offsetY)
      );
      updateConfig((c) => ({ ...c, bubbleX: nextX, bubbleY: nextY }));
    } else if (canvasDragRef.current.type === 'split') {
      const nextRatio = Math.max(0.18, Math.min(0.6, normY));
      updateConfig((c) => ({ ...c, splitRatio: Number(nextRatio.toFixed(2)) }));
    }
  };

  const handleCanvasPointerUp = () => {
    canvasDragRef.current.type = null;
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-100">
      {/* Hidden Video Elements for Raw Streams & Playback */}
      <video ref={liveScreenVideoRef} muted playsInline className="hidden" />
      <video ref={liveCamVideoRef} muted playsInline className="hidden" />
      {rawScreenUrl && (
        <video
          ref={editScreenVideoRef}
          src={rawScreenUrl}
          playsInline
          className="hidden"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) {
              setDuration(d);
              setTrimEnd(d);
            }
          }}
        />
      )}
      {rawCamUrl && <video ref={editCamVideoRef} src={rawCamUrl} playsInline className="hidden" />}

      {/* Top Navigation & Capture Bar */}
      <header className="h-13 shrink-0 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center font-bold text-xs tracking-tighter">
            9:16
          </div>
          <span className="font-semibold text-sm tracking-tight text-white">NineSixteen</span>
        </div>

        {/* Center Capture Source Controls */}
        {mode === 'live' ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleDemoFeeds}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                isDemoActive
                  ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400'
              }`}
              title="Toggle simulated demo feeds"
            >
              <Wand2 className="w-3.5 h-3.5 text-violet-400" />
              <span>Demo</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {instantCompositeUrl && (
              <a
                href={instantCompositeUrl}
                download={`NineSixteen-LiveCut.${recordedExt}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download Live Cut</span>
              </a>
            )}
          </div>
        )}

        {/* Right Action Button: Record Start/Stop */}
        <div className="flex items-center gap-2">
          {mode === 'live' &&
            (!isRecording ? (
              <button
                type="button"
                onClick={handleStartRecording}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/25 transition cursor-pointer"
              >
                <CircleDot className="w-3.5 h-3.5 fill-current" />
                <span>Record</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopRecording}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/40 animate-pulse transition cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span className="font-mono">
                  {Math.floor(recordingSeconds / 60)}:
                  {String(Math.floor(recordingSeconds % 60)).padStart(2, '0')}
                </span>
              </button>
            ))}
        </div>
      </header>

      {/* Error Banner if any */}
      {errorBanner && (
        <div className="bg-rose-950/90 border-b border-rose-800 px-5 py-2 text-xs text-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-300 hover:text-white underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Sidebar: Minimal Layout Switcher & Contextual Controls */}
        <aside className="w-80 shrink-0 border-r border-zinc-800/80 bg-zinc-950/60 overflow-y-auto p-4 space-y-4">
          {/* Segmented 2-Mode Layout Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900 rounded-xl border border-zinc-800">
            {(
              [
                { id: 'split-top-cam', label: 'Split' },
                { id: 'circle-bubble', label: 'Bubble' },
              ] as { id: LayoutPreset; label: string }[]
            ).map((tab) => {
              const isActive = currentConfig.layout === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    updateConfig((c) => ({
                      ...c,
                      layout: tab.id,
                    }))
                  }
                  className={`py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Contextual Layout Controls */}
          <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 space-y-3">
            {/* Split Ratio Slider */}
            {currentConfig.layout === 'split-top-cam' && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Split Ratio</span>
                  <span className="font-mono text-zinc-200">
                    {Math.round(currentConfig.splitRatio * 100)} /{' '}
                    {100 - Math.round(currentConfig.splitRatio * 100)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.18}
                  max={0.55}
                  step={0.01}
                  value={currentConfig.splitRatio}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, splitRatio: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-violet-500"
                />
              </div>
            )}

            {/* Bubble Controls */}
            {currentConfig.layout === 'circle-bubble' && (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Size</span>
                    <span className="font-mono text-zinc-200">
                      {Math.round(currentConfig.bubbleRadius * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.12}
                    max={0.32}
                    step={0.01}
                    value={currentConfig.bubbleRadius}
                    onChange={(e) =>
                      updateConfig((c) => ({ ...c, bubbleRadius: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-violet-500"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {(['circle', 'rounded'] as const).map((shape) => (
                      <button
                        key={shape}
                        type="button"
                        onClick={() => updateConfig((c) => ({ ...c, bubbleShape: shape }))}
                        className={`px-2.5 py-1 rounded-md text-xs border transition cursor-pointer capitalize ${
                          currentConfig.bubbleShape === shape
                            ? 'bg-violet-600/25 border-violet-500 text-white'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {shape === 'rounded' ? 'Squircle' : 'Circle'}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    {[
                      { label: 'TL', x: 0.24, y: 0.16 },
                      { label: 'TR', x: 0.76, y: 0.16 },
                      { label: 'BL', x: 0.24, y: 0.78 },
                      { label: 'BR', x: 0.76, y: 0.78 },
                    ].map((pos) => (
                      <button
                        key={pos.label}
                        type="button"
                        onClick={() =>
                          updateConfig((c) => ({ ...c, bubbleX: pos.x, bubbleY: pos.y }))
                        }
                        className="px-1.5 py-1 rounded bg-zinc-950 hover:bg-zinc-800 text-[10px] font-mono text-zinc-400 border border-zinc-800 cursor-pointer"
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Screen Box: Single Source of Truth for Screen Framing & Cropping */}
          {hasScreen || mode === 'edit' ? (
            <ScreenCropSelector
              screenVideo={
                mode === 'live' ? liveScreenVideoRef.current : editScreenVideoRef.current
              }
              crop={currentConfig.screenCrop}
              fitMode={currentConfig.screenFitMode}
              isDemo={mode === 'live' && isDemoActive}
              onChangeCrop={(nextCrop: CropRect) =>
                updateConfig((c) => ({
                  ...c,
                  screenCrop: nextCrop,
                }))
              }
              onChangeFitMode={(nextFit) =>
                updateConfig((c) => ({
                  ...c,
                  screenFitMode: nextFit,
                }))
              }
              onConnectRealScreen={mode === 'live' && isDemoActive ? handleToggleScreen : undefined}
              onDisableScreen={mode === 'live' && !isDemoActive ? handleToggleScreen : undefined}
            />
          ) : (
            <button
              type="button"
              onClick={handleToggleScreen}
              className="w-full py-8 bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-2 text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <Monitor className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-medium">Enable Screen</span>
            </button>
          )}

          {/* Camera Box: Starts as 'Enable Camera', transitions to Camera Controls when enabled */}
          {hasCam && !isDemoActive ? (
            <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Camera</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateConfig((c) => ({ ...c, mirrorCam: !c.mirrorCam }))}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${
                      currentConfig.mirrorCam
                        ? 'bg-violet-600/20 border-violet-500/50 text-violet-200'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <FlipHorizontal className="w-3 h-3" />
                    <span>Mirror</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleCam}
                    className="px-2 py-0.5 rounded text-[11px] bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition cursor-pointer"
                  >
                    Off
                  </button>
                </div>
              </div>

              {cameraDevices.length > 0 && (
                <select
                  value={selectedCamId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedCamId(nextId);
                    startCameraStream(nextId);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                >
                  {cameraDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Zoom</span>
                  <span className="font-mono text-zinc-300">
                    {currentConfig.camZoom.toFixed(1)}×
                  </span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={2.2}
                  step={0.05}
                  value={currentConfig.camZoom}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, camZoom: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-violet-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Padding</span>
                  <span className="font-mono text-zinc-300">{currentConfig.canvasPadding}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={32}
                  step={2}
                  value={currentConfig.canvasPadding}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, canvasPadding: parseInt(e.target.value, 10) }))
                  }
                  className="w-full accent-violet-500"
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleToggleCam}
              className="w-full py-8 bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-2 text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <Camera className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-medium">Enable Camera</span>
            </button>
          )}
        </aside>

        {/* Center Stage: Live 9:16 Vertical Canvas Preview */}
        <main className="flex-1 min-w-0 flex flex-col items-center justify-center p-6 bg-zinc-950 relative overflow-hidden">
          <div className="absolute w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Interactive 9:16 Phone Frame Container */}
          <div className="relative h-full max-h-[86vh] aspect-[9/16] rounded-[28px] p-2 bg-zinc-900/90 border border-zinc-800 shadow-2xl flex flex-col">
            <div className="relative w-full h-full rounded-[20px] overflow-hidden bg-black">
              <canvas
                ref={compositeCanvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
              />

              {/* Live Recording Badge Overlay (UI only, not baked into canvas) */}
              {isRecording && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600/90 text-white text-[11px] font-semibold shadow-lg pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>REC</span>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Bottom Post-Recording Multi-Track Timeline Editor */}
      {mode === 'edit' && (
        <TimelineEditor
          duration={duration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          isExporting={isExporting}
          exportProgress={exportProgress}
          trimStart={trimStart}
          trimEnd={trimEnd}
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          onSeek={handleSeek}
          onTogglePlay={handleTogglePlay}
          onSplitAtPlayhead={handleSplitAtPlayhead}
          onDeleteSegmentSplit={handleDeleteSegmentSplit}
          onSelectSegment={(id) => setSelectedSegmentId(id)}
          onChangeSegmentLayout={(segmentId, layout) => {
            setSelectedSegmentId(segmentId);
            setSegments((prev) =>
              prev.map((s) =>
                s.id === segmentId
                  ? {
                      ...s,
                      config: {
                        ...s.config,
                        layout,
                      },
                    }
                  : s
              )
            );
          }}
          onTrimChange={(s, e) => {
            setTrimStart(s);
            setTrimEnd(e);
          }}
          onExportVideo={handleExportEditedVideo}
          onDiscardAndNewRecording={() => {
            editScreenVideoRef.current?.pause();
            editCamVideoRef.current?.pause();
            setIsPlaying(false);
            setMode('live');
          }}
        />
      )}
    </div>
  );
}
export default App;
