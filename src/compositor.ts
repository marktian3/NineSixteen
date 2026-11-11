import { BackgroundStyle, CropRect, SegmentConfig } from './types';

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

function getSourceDimensions(source: HTMLVideoElement | HTMLCanvasElement | null): {
  w: number;
  h: number;
} {
  if (!source) return { w: 0, h: 0 };
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth, h: source.videoHeight };
  }
  return { w: source.width, h: source.height };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  style: BackgroundStyle
) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  switch (style) {
    case 'midnight-violet':
      grad.addColorStop(0, '#0f0720');
      grad.addColorStop(0.5, '#19102c');
      grad.addColorStop(1, '#09090b');
      break;
    case 'cyber-teal':
      grad.addColorStop(0, '#041f24');
      grad.addColorStop(0.5, '#0b192c');
      grad.addColorStop(1, '#09090b');
      break;
    case 'sunset':
      grad.addColorStop(0, '#2a0a18');
      grad.addColorStop(0.5, '#1f1124');
      grad.addColorStop(1, '#09090b');
      break;
    case 'obsidian':
    default:
      grad.addColorStop(0, '#09090b');
      grad.addColorStop(0.5, '#121216');
      grad.addColorStop(1, '#09090b');
      break;
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.closePath();
}

/**
 * Draws a webcam source inside destination rect (dx, dy, dw, dh) using center-cover + zoom/pan + mirror
 */
function drawCameraCover(
  ctx: CanvasRenderingContext2D,
  camSource: HTMLVideoElement | HTMLCanvasElement | null,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  config: SegmentConfig,
  borderRadius = 0
) {
  ctx.save();
  if (borderRadius > 0) {
    drawRoundedRectPath(ctx, dx, dy, dw, dh, borderRadius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
  }

  const { w: sw, h: sh } = getSourceDimensions(camSource);
  if (!camSource || sw === 0 || sh === 0) {
    // Placeholder when webcam is not active
    ctx.fillStyle = '#18181b';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = '#71717a';
    ctx.font = '600 30px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Camera Feed', dx + dw / 2, dy + dh / 2);
    ctx.restore();
    return;
  }

  const destAspect = dw / dh;
  const srcAspect = sw / sh;

  let cropW = sw;
  let cropH = sh;
  if (srcAspect > destAspect) {
    cropW = sh * destAspect;
  } else {
    cropH = sw / destAspect;
  }

  const zoom = Math.max(1, config.camZoom || 1);
  cropW /= zoom;
  cropH /= zoom;

  const maxPanX = (sw - cropW) / 2;
  const maxPanY = (sh - cropH) / 2;

  const sx = (sw - cropW) / 2 + (config.camPanX || 0) * maxPanX;
  const sy = (sh - cropH) / 2 + (config.camPanY || 0) * maxPanY;

  if (config.mirrorCam) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(camSource, sx, sy, cropW, cropH, 0, 0, dw, dh);
  } else {
    ctx.drawImage(camSource, sx, sy, cropW, cropH, dx, dy, dw, dh);
  }

  ctx.restore();
}

/**
 * Draws the screen/window source into destination rect (dx, dy, dw, dh)
 * Supports:
 * - 'custom-region' (or when layout === 'region-focus'): crops to config.screenCrop
 * - 'cover-center': fills destination rect with center crop
 * - 'contain-card': fits the window/region cleanly inside destination rect with subtle ambient backdrop & shadow
 */
function drawScreenIntoRect(
  ctx: CanvasRenderingContext2D,
  screenSource: HTMLVideoElement | HTMLCanvasElement | null,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  config: SegmentConfig,
  borderRadius = 0
) {
  ctx.save();
  if (borderRadius > 0) {
    drawRoundedRectPath(ctx, dx, dy, dw, dh, borderRadius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
  }

  const { w: sw, h: sh } = getSourceDimensions(screenSource);
  if (!screenSource || sw === 0 || sh === 0) {
    ctx.fillStyle = '#111115';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = '#52525b';
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Screen / Window Feed', dx + dw / 2, dy + dh / 2);
    ctx.restore();
    return;
  }

  const crop: CropRect = config.screenCrop || { x: 0, y: 0, width: 1, height: 1 };

  const sx = Math.max(0, Math.min(sw - 1, crop.x * sw));
  const sy = Math.max(0, Math.min(sh - 1, crop.y * sh));
  const sWidth = Math.max(16, Math.min(sw - sx, crop.width * sw));
  const sHeight = Math.max(16, Math.min(sh - sy, crop.height * sh));

  if (config.screenFitMode === 'cover-center') {
    // Fill destination rect completely
    const destAspect = dw / dh;
    const srcAspect = sWidth / sHeight;
    let cw = sWidth;
    let ch = sHeight;
    if (srcAspect > destAspect) {
      cw = sHeight * destAspect;
    } else {
      ch = sWidth / destAspect;
    }
    const cx = sx + (sWidth - cw) / 2;
    const cy = sy + (sHeight - ch) / 2;
    ctx.drawImage(screenSource, cx, cy, cw, ch, dx, dy, dw, dh);
  } else {
    // Fit the selected window/region inside destination rect while filling ambient backdrop
    // First draw a darkened blurred/scaled ambient fill of the screen
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.drawImage(screenSource, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
    ctx.fillStyle = 'rgba(9, 9, 11, 0.55)';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.restore();

    // Calculate aspect-preserving fit inside (dx, dy, dw, dh)
    const srcAspect = sWidth / sHeight;
    const destAspect = dw / dh;

    let fitW = dw;
    let fitH = dh;
    if (srcAspect > destAspect) {
      fitH = dw / srcAspect;
    } else {
      fitW = dh * srcAspect;
    }

    const fitX = dx + (dw - fitW) / 2;
    const fitY = dy + (dh - fitH) / 2;

    // Draw sleek window drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 12;
    drawRoundedRectPath(ctx, fitX, fitY, fitW, fitH, 16);
    ctx.fillStyle = '#09090b';
    ctx.fill();
    ctx.restore();

    // Draw the crisp screen region
    ctx.save();
    drawRoundedRectPath(ctx, fitX, fitY, fitW, fitH, 16);
    ctx.clip();
    ctx.drawImage(screenSource, sx, sy, sWidth, sHeight, fitX, fitY, fitW, fitH);
    ctx.restore();

    // Subtle glass border around fitted window/region
    ctx.save();
    drawRoundedRectPath(ctx, fitX, fitY, fitW, fitH, 16);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draws the floating circular or rounded webcam bubble (used in Format 2 & optionally Format 3)
 */
function drawFloatingBubble(
  ctx: CanvasRenderingContext2D,
  camSource: HTMLVideoElement | HTMLCanvasElement | null,
  w: number,
  h: number,
  config: SegmentConfig
) {
  const radiusPx = Math.max(80, Math.min(420, config.bubbleRadius * w));
  const diameter = radiusPx * 2;
  const cx = config.bubbleX * w;
  const cy = config.bubbleY * h;
  const bx = cx - radiusPx;
  const by = cy - radiusPx;

  const cornerRadius = config.bubbleShape === 'circle' ? radiusPx : radiusPx * 0.34;

  // Outer drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 10;
  drawRoundedRectPath(ctx, bx, by, diameter, diameter, cornerRadius);
  ctx.fillStyle = '#18181b';
  ctx.fill();
  ctx.restore();

  // Camera inside bubble
  drawCameraCover(ctx, camSource, bx, by, diameter, diameter, config, cornerRadius);

  // Crisp ring border
  ctx.save();
  drawRoundedRectPath(ctx, bx, by, diameter, diameter, cornerRadius);
  ctx.strokeStyle = config.bubbleBorderColor || '#8b5cf6';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

/**
 * Main 9:16 composite renderer (1080x1920)
 */
export function renderCompositeFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  screenSource: HTMLVideoElement | HTMLCanvasElement | null,
  camSource: HTMLVideoElement | HTMLCanvasElement | null,
  config: SegmentConfig
) {
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h, config.backgroundStyle);

  const pad = config.canvasPadding ?? 14;
  const cardRadius = pad > 0 ? 24 : 0;

  if (config.layout === 'split-top-cam') {
    // FORMAT 1: Head on top 30% (configurable), Window on bottom 70%
    const ratio = Math.max(0.15, Math.min(0.65, config.splitRatio || 0.30));
    const gap = pad > 0 ? Math.max(10, Math.round(pad * 0.75)) : 4;
    const totalInnerH = h - pad * 2 - gap;
    const topH = Math.round(totalInnerH * ratio);
    const bottomH = totalInnerH - topH;
    const innerW = w - pad * 2;

    // Top 30%: Head Camera
    drawCameraCover(ctx, camSource, pad, pad, innerW, topH, config, cardRadius);

    // Bottom 70%: Screen / Window
    const bottomY = pad + topH + gap;
    drawScreenIntoRect(
      ctx,
      screenSource,
      pad,
      bottomY,
      innerW,
      bottomH,
      config,
      cardRadius
    );

    // Subtle border around cards
    if (pad > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      drawRoundedRectPath(ctx, pad, pad, innerW, topH, cardRadius);
      ctx.stroke();
      drawRoundedRectPath(ctx, pad, bottomY, innerW, bottomH, cardRadius);
      ctx.stroke();
      ctx.restore();
    } else {
      // Divider line when edge-to-edge
      ctx.save();
      ctx.fillStyle = 'rgba(139, 92, 246, 0.75)';
      ctx.fillRect(0, topH, w, gap);
      ctx.restore();
    }
  } else if (config.layout === 'circle-bubble') {
    // FORMAT 2: Window takes full 9:16 frame, Head in circular bubble
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    drawScreenIntoRect(
      ctx,
      screenSource,
      pad,
      pad,
      innerW,
      innerH,
      config,
      cardRadius
    );
    drawFloatingBubble(ctx, camSource, w, h, config);
  }
}
