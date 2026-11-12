/**
 * Synthetic Demo MediaStream generator so users can immediately test
 * live layout switching, screen region cropping, dual-track recording,
 * and post-recording timeline editing even without enabling physical hardware.
 */
export interface DemoStreamsController {
  screenStream: MediaStream;
  camStream: MediaStream;
  setPaused: (paused: boolean) => void;
  stop: () => void;
}

export function createDemoStreams(): DemoStreamsController {
  // 1. Simulated Widescreen Coding Monitor (1920x1080)
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1920;
  screenCanvas.height = 1080;
  const sCtx = screenCanvas.getContext('2d')!;

  // 2. Simulated Webcam Feed (1280x720)
  const camCanvas = document.createElement('canvas');
  camCanvas.width = 1280;
  camCanvas.height = 720;
  const cCtx = camCanvas.getContext('2d')!;

  let tick = 0;
  const codeLines = [
    'import { renderCompositeFrame } from "./compositor";',
    'import { SegmentConfig, TimelineSegment } from "./types";',
    '',
    'export async function recordVerticalSession(config: SegmentConfig) {',
    '  const screen = await navigator.mediaDevices.getDisplayMedia({',
    '    video: { frameRate: 60 },',
    '  });',
    '  const camera = await navigator.mediaDevices.getUserMedia({',
    '    video: { width: 1280, height: 720 },',
    '    audio: true,',
    '  });',
    '',
    '  // Format 1: 30% Head on Top, 70% Window on Bottom',
    '  // Format 2: Circular Bubble + Full Window',
    '  // Format 3: Custom Cropped Screen Region + Head',
    '  return { screen, camera, layout: config.layout };',
    '}',
  ];

  const terminalLogs = [
    '$ npm run dev',
    '  VITE v6.2.0  ready in 142 ms',
    '  ➜  Local:   http://localhost:5173/',
    '  ➜  Capturing raw Screen + Webcam tracks @ 60fps...',
    '  ✓  Segment #1 [00:00 -> 00:04] Layout: 30/70 Split',
    '  ✓  Segment #2 [00:04 -> 00:08] Layout: Circle Bubble',
    '  ✓  Segment #3 [00:08 -> 00:12] Layout: Screen Region Crop',
  ];

  const renderTick = () => {
    tick += 1;
    const t = tick * 0.03;

    // --- Draw Simulated macOS Desktop + IDE + Terminal ---
    const bgGrad = sCtx.createLinearGradient(0, 0, 1920, 1080);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(1, '#111827');
    sCtx.fillStyle = bgGrad;
    sCtx.fillRect(0, 0, 1920, 1080);

    // Left Pane: Code Editor Window
    sCtx.fillStyle = '#0f172a';
    sCtx.beginPath();
    sCtx.roundRect(48, 48, 1060, 680, 16);
    sCtx.fill();
    sCtx.strokeStyle = '#334155';
    sCtx.lineWidth = 2;
    sCtx.stroke();

    // Traffic lights
    const lights = ['#ef4444', '#f59e0b', '#10b981'];
    lights.forEach((col, idx) => {
      sCtx.fillStyle = col;
      sCtx.beginPath();
      sCtx.arc(82 + idx * 24, 80, 7, 0, Math.PI * 2);
      sCtx.fill();
    });

    sCtx.fillStyle = '#94a3b8';
    sCtx.font = '600 18px monospace';
    sCtx.fillText('NineSixteen — src/recorder.ts', 180, 86);

    // Code lines with animated typing highlight
    const activeLine = Math.floor((tick / 25) % codeLines.length);
    sCtx.fillStyle = 'rgba(139, 92, 246, 0.16)';
    sCtx.fillRect(60, 118 + activeLine * 32, 1030, 30);

    codeLines.forEach((line, i) => {
      sCtx.fillStyle = '#475569';
      sCtx.font = '500 18px monospace';
      sCtx.fillText(String(i + 1).padStart(2, '0'), 74, 140 + i * 32);

      sCtx.fillStyle = line.trim().startsWith('//')
        ? '#34d399'
        : line.includes('import') || line.includes('export')
        ? '#c084fc'
        : '#e2e8f0';
      sCtx.fillText(line, 120, 140 + i * 32);
    });

    // Right Pane: Live App Metrics / Browser Preview Window
    sCtx.fillStyle = '#18181b';
    sCtx.beginPath();
    sCtx.roundRect(1140, 48, 732, 680, 16);
    sCtx.fill();
    sCtx.strokeStyle = '#3f3f46';
    sCtx.stroke();

    sCtx.fillStyle = '#a855f7';
    sCtx.font = '700 24px -apple-system, sans-serif';
    sCtx.fillText('Right Window: Live Analytics', 1180, 110);

    // Animated bars in right pane
    for (let i = 0; i < 6; i++) {
      const barH = 120 + Math.sin(t + i * 0.9) * 85;
      sCtx.fillStyle = i % 2 === 0 ? '#8b5cf6' : '#06b6d4';
      sCtx.beginPath();
      sCtx.roundRect(1190 + i * 105, 520 - barH, 72, barH, 10);
      sCtx.fill();
    }

    // Bottom Pane: Terminal Window
    sCtx.fillStyle = '#09090b';
    sCtx.beginPath();
    sCtx.roundRect(48, 756, 1824, 280, 16);
    sCtx.fill();
    sCtx.strokeStyle = '#27272a';
    sCtx.stroke();

    terminalLogs.forEach((log, i) => {
      sCtx.fillStyle = log.includes('✓') ? '#4ade80' : '#d4d4d8';
      sCtx.font = '500 20px monospace';
      sCtx.fillText(log, 84, 808 + i * 32);
    });

    // Animated Cursor
    const cursorX = 520 + Math.cos(t * 0.8) * 340;
    const cursorY = 380 + Math.sin(t * 1.1) * 220;
    sCtx.fillStyle = '#f43f5e';
    sCtx.beginPath();
    sCtx.arc(cursorX, cursorY, 12, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.strokeStyle = '#ffffff';
    sCtx.lineWidth = 3;
    sCtx.stroke();

    // --- Draw Simulated Presenter Webcam (1280x720) ---
    const camGrad = cCtx.createLinearGradient(0, 0, 1280, 720);
    camGrad.addColorStop(0, '#1e1b4b');
    camGrad.addColorStop(0.5, '#311042');
    camGrad.addColorStop(1, '#0f172a');
    cCtx.fillStyle = camGrad;
    cCtx.fillRect(0, 0, 1280, 720);

    // Subtle studio key light glow
    const glow = cCtx.createRadialGradient(640, 340, 40, 640, 340, 420);
    glow.addColorStop(0, 'rgba(167, 139, 250, 0.35)');
    glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
    cCtx.fillStyle = glow;
    cCtx.fillRect(0, 0, 1280, 720);

    // Animated presenter avatar silhouette (head + shoulders + speaking ring)
    const headBob = Math.sin(t * 1.8) * 8;
    const headTilt = Math.cos(t * 1.1) * 6;

    // Shoulders
    cCtx.fillStyle = '#4c1d95';
    cCtx.beginPath();
    cCtx.ellipse(640 + headTilt, 690, 270, 190, 0, Math.PI, 0, false);
    cCtx.fill();

    // Speaking pulse ring around head
    const pulse = 115 + Math.abs(Math.sin(t * 3.2)) * 18;
    cCtx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
    cCtx.lineWidth = 4;
    cCtx.beginPath();
    cCtx.arc(640 + headTilt, 320 + headBob, pulse, 0, Math.PI * 2);
    cCtx.stroke();

    // Head
    cCtx.fillStyle = '#fcd34d';
    cCtx.beginPath();
    cCtx.arc(640 + headTilt, 320 + headBob, 96, 0, Math.PI * 2);
    cCtx.fill();

    // Headphones
    cCtx.strokeStyle = '#18181b';
    cCtx.lineWidth = 18;
    cCtx.beginPath();
    cCtx.arc(640 + headTilt, 315 + headBob, 104, Math.PI * 1.1, Math.PI * 1.9);
    cCtx.stroke();

    // Eyes & Smile
    cCtx.fillStyle = '#18181b';
    cCtx.beginPath();
    cCtx.arc(606 + headTilt, 305 + headBob, 9, 0, Math.PI * 2);
    cCtx.arc(674 + headTilt, 305 + headBob, 9, 0, Math.PI * 2);
    cCtx.fill();

    cCtx.strokeStyle = '#18181b';
    cCtx.lineWidth = 6;
    cCtx.beginPath();
    cCtx.arc(640 + headTilt, 335 + headBob, 32, 0.15 * Math.PI, 0.85 * Math.PI);
    cCtx.stroke();

    // Badge
    cCtx.fillStyle = 'rgba(9, 9, 11, 0.65)';
    cCtx.beginPath();
    cCtx.roundRect(40, 40, 260, 46, 23);
    cCtx.fill();
    cCtx.fillStyle = '#a7f3d0';
    cCtx.font = '600 18px -apple-system, sans-serif';
    cCtx.fillText('● DEMO WEBCAM FEED', 64, 69);
  };

  let isPaused = false;
  renderTick();
  const intervalId = window.setInterval(() => {
    if (!isPaused) renderTick();
  }, 1000 / 24);

  const screenStream = screenCanvas.captureStream(24);
  const camStream = camCanvas.captureStream(24);

  return {
    screenStream,
    camStream,
    setPaused: (paused: boolean) => {
      isPaused = paused;
    },
    stop: () => {
      window.clearInterval(intervalId);
      screenStream.getTracks().forEach((t) => t.stop());
      camStream.getTracks().forEach((t) => t.stop());
    },
  };
}
