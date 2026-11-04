# NineSixteen (9:16)

A lightweight, zero-watermark **9:16 vertical screen + webcam studio** and **non-destructive post-recording timeline editor** built for TikTok, Reels, and YouTube Shorts creators.

## Features

### 1. Three Core Vertical Formats (Hotkeys `1`, `2`, `3`)
- **Format 1 — 30/70 Split Screen (`1`)**: Head webcam on top 30% of the canvas, window/screen capture on the bottom 70% (with a draggable split divider to adjust from 20/80 to 55/45).
- **Format 2 — Circular Bubble PiP (`2`)**: Window/screen fills the 9:16 frame while your head sits in a draggable, resizable circular (or squircle) floating bubble.
- **Format 3 — Screen Region Crop + Head (`3`)**: Interactive widescreen crop box selector so you can record/display only a specific portion of your screen (e.g., Left IDE pane, Bottom Terminal, or a 9:16 vertical slice) paired with either the Top 30% Head Split or Floating Bubble.

### 2. Hybrid Dual-Track Recording + Post-Recording Timeline
- **Raw Multi-Track Capture**: Simultaneously records your raw screen stream and raw webcam + mic stream alongside a live composite cut.
- **Instant Live Cut OR Post-Recording Editing**:
  - Download your live-switched recording immediately in 0 seconds, **or**
  - Use the **Non-Destructive Timeline Editor** to scrub through your recording, press `S` to split at the playhead, switch any segment between Formats `1`, `2`, and `3`, reposition the screen crop box *after* recording, trim start/end points, and export a crisp `1080×1920` (60fps) `.mp4` / `.webm` video.
- **Floating Picture-in-Picture (PiP) Monitor**: Pop out an Always-on-Top 9:16 preview window while working in VS Code, Terminal, or your browser.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome, Brave, Arc, or Edge.
