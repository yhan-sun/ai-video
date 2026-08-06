export const VIDEO_TOKENS = {
  width: 1080,
  height: 1920,
  safeTop: 180,
  safeBottom: 260,
  safeSides: 80,
  sceneColors: {
    hook: "#ffdd2d",
    pain: "#ff7a59",
    proof: "#4ade80",
    offer: "#60a5fa",
    cta: "#c084fc",
  } as Record<string, string>,
  scrimOpacity: 0.52,
  radius: 24,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif",
  headlineMaxChars: 18,
  subtitleMaxChars: 34,
  enterFrames: 18,
  zoomStart: 1.03,
  zoomEnd: 1.12,
} as const;

export const sceneColor = (type: string, fallback = "#ffdd2d") =>
  VIDEO_TOKENS.sceneColors[type] ?? fallback;

export const headlineFontSize = (length: number) => {
  if (length <= 8) {
    return 92;
  }
  if (length <= 12) {
    return 80;
  }
  if (length <= 16) {
    return 70;
  }
  if (length <= 20) {
    return 60;
  }
  return 52;
};

export const subtitleFontSize = (length: number) => {
  if (length <= 20) {
    return 44;
  }
  if (length <= 30) {
    return 38;
  }
  return 32;
};

export const clampLines = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars - 1) + "…" : trimmed;
};
