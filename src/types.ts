export type LayoutPreset = 'split-top-cam' | 'circle-bubble';

export interface CropRect {
  /** Normalized 0..1 from left of source screen video */
  x: number;
  /** Normalized 0..1 from top of source screen video */
  y: number;
  /** Normalized 0..1 width of crop box */
  width: number;
  /** Normalized 0..1 height of crop box */
  height: number;
}

export type BackgroundStyle = 'obsidian' | 'midnight-violet' | 'cyber-teal' | 'sunset';

export interface SegmentConfig {
  layout: LayoutPreset;
  /** Top webcam height ratio for split mode (default 0.30 = 30% head, 70% screen) */
  splitRatio: number;
  /** Normalized 0..1 center X of floating bubble on 9:16 canvas */
  bubbleX: number;
  /** Normalized 0..1 center Y of floating bubble on 9:16 canvas */
  bubbleY: number;
  /** Radius relative to canvas width (e.g. 0.19) */
  bubbleRadius: number;
  bubbleShape: 'circle' | 'rounded';
  bubbleBorderColor: string;
  /** Normalized crop rectangle on the source screen video (0,0,1,1 = Full screen) */
  screenCrop: CropRect;
  /** Camera zoom (1.0 - 2.5) */
  camZoom: number;
  /** Camera horizontal pan (-1 to 1) */
  camPanX: number;
  /** Camera vertical pan (-1 to 1) */
  camPanY: number;
  /** Mirror webcam horizontally */
  mirrorCam: boolean;
  /** Padding around frames in pixels (at 1080x1920 scale) */
  canvasPadding: number;
  backgroundStyle: BackgroundStyle;
}

export interface TimelineSegment {
  id: string;
  startTime: number;
  endTime: number;
  config: SegmentConfig;
}

export const DEFAULT_SEGMENT_CONFIG: SegmentConfig = {
  layout: 'split-top-cam',
  splitRatio: 0.30,
  bubbleX: 0.76,
  bubbleY: 0.78,
  bubbleRadius: 0.19,
  bubbleShape: 'circle',
  bubbleBorderColor: '#8b5cf6',
  screenCrop: {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  },
  camZoom: 1.0,
  camPanX: 0,
  camPanY: 0,
  mirrorCam: true,
  canvasPadding: 14,
  backgroundStyle: 'obsidian',
};

export const LAYOUT_META: Record<LayoutPreset, { title: string; shortcut: string }> = {
  'split-top-cam': {
    title: 'Split',
    shortcut: '1',
  },
  'circle-bubble': {
    title: 'Bubble',
    shortcut: '2',
  },
};
