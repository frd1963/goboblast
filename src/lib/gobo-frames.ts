import { keyPixels, type KeyParams } from "@/lib/gobo-key";
import type { TextAlign } from "@/lib/settings";

/** One upright raster, then a pre-rotated copy. A quarter degree keeps a slow spin from stepping. */
export const FRAME_STEP_DEGREES = 0.25;
export const FRAME_COUNT = Math.round(360 / FRAME_STEP_DEGREES);

const MAX_DEVICE_EDGE = 640;

export type GoboRasterInput = {
  text: string;
  color: string;
  fontStack: string;
  fontWeight: number;
  fontPx: number;
  letterSpacingEm: number;
  lineHeight: number;
  align: TextAlign;
  outline: boolean;
  outlinePx: number;
  outlineColor: string;
  glowWidePx: number;
  glowTightPx: number;
  maxWidthPx: number;
};

export type GoboFrameSet = {
  frames: ImageBitmap[];
  /** On-screen square, in CSS pixels. Every frame uses this same box. */
  cssSize: number;
};

function resolveFamily(stack: string) {
  const probe = document.createElement("span");
  probe.style.fontFamily = stack;
  probe.style.position = "fixed";
  probe.style.left = "-9999px";
  probe.textContent = "Gobo";
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family || stack;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    const tokens = paragraph.split(/(\s+)/);
    const flush = () => {
      lines.push(line.replace(/\s+$/u, ""));
      line = "";
    };
    const breakLong = (token: string) => {
      let chunk = "";
      for (const char of token) {
        const next = chunk + char;
        if (chunk && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    };
    for (const token of tokens) {
      if (!token) continue;
      const trial = line + token;
      if (!line || ctx.measureText(trial).width <= maxWidth) {
        if (!line && ctx.measureText(token).width > maxWidth) breakLong(token);
        else line = trial;
        continue;
      }
      flush();
      if (ctx.measureText(token).width > maxWidth) breakLong(token.trimStart());
      else line = token.trimStart();
    }
    if (line.trim()) lines.push(line.replace(/\s+$/u, ""));
  }
  return lines.length > 0 ? lines : [""];
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  fontPx: number,
  lineHeight: number,
  align: TextAlign,
  color: string,
  outline: boolean,
  outlinePx: number,
  outlineColor: string,
  shadowBlur: number,
) {
  const step = fontPx * lineHeight;
  const widths = lines.map((line) => ctx.measureText(line).width);
  const blockWidth = Math.max(1, ...widths);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  lines.forEach((line, index) => {
    const y = (index + 0.5) * step;
    let x = blockWidth / 2;
    ctx.textAlign = "center";
    if (align === "left") {
      x = 0;
      ctx.textAlign = "left";
    } else if (align === "right") {
      x = blockWidth;
      ctx.textAlign = "right";
    }
    if (outline && outlinePx > 0) {
      ctx.lineWidth = outlinePx;
      ctx.strokeStyle = outlineColor;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(line, x, y);
  });
  ctx.shadowBlur = 0;
  return { blockWidth, blockHeight: Math.max(step, lines.length * step) };
}

export function frameIndex(angle: number) {
  const turns = ((angle % 360) + 360) % 360;
  return Math.round(turns / FRAME_STEP_DEGREES) % FRAME_COUNT;
}

export async function renderGoboFrames(
  input: GoboRasterInput,
  onFirst?: (bitmap: ImageBitmap, cssSize: number) => void,
  isCurrent: () => boolean = () => true,
): Promise<GoboFrameSet> {
  await document.fonts.ready;
  const family = resolveFamily(input.fontStack);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fontSpec = `${input.fontWeight} ${input.fontPx}px ${family}`;
  try {
    await document.fonts.load(fontSpec);
  } catch {
    // A missing face still draws with the next family in the stack.
  }

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return { frames: [], cssSize: 1 };
  measure.font = fontSpec;
  measure.letterSpacing = `${input.letterSpacingEm}em`;
  const maxWidth = Math.max(input.fontPx, input.maxWidthPx);
  const lines = wrapLines(measure, input.text, maxWidth);
  const widths = lines.map((line) => measure.measureText(line).width);
  const blockWidth = Math.max(1, ...widths);
  const blockHeight = Math.max(input.fontPx * input.lineHeight, lines.length * input.fontPx * input.lineHeight);
  const pad = Math.ceil(input.glowWidePx + input.outlinePx + input.fontPx * 0.2);
  const natural = Math.ceil(Math.hypot(blockWidth + pad * 2, blockHeight + pad * 2));
  const deviceEdge = Math.ceil(natural * dpr);
  const scale = deviceEdge > MAX_DEVICE_EDGE ? MAX_DEVICE_EDGE / deviceEdge : 1;
  const cssSize = natural;
  const bitmapEdge = Math.max(2, Math.round(natural * dpr * scale));

  const source = document.createElement("canvas");
  source.width = Math.max(2, Math.round((blockWidth + pad * 2) * dpr * scale));
  source.height = Math.max(2, Math.round((blockHeight + pad * 2) * dpr * scale));
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) return { frames: [], cssSize };
  sourceCtx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  sourceCtx.font = fontSpec;
  sourceCtx.letterSpacing = `${input.letterSpacingEm}em`;
  sourceCtx.translate(pad, pad);

  const paint = (blur: number) => {
    drawBlock(
      sourceCtx,
      lines,
      input.fontPx,
      input.lineHeight,
      input.align,
      input.color,
      input.outline,
      input.outlinePx,
      input.outlineColor,
      blur,
    );
  };
  if (input.glowWidePx > 0) paint(input.glowWidePx);
  if (input.glowTightPx > 0) paint(input.glowTightPx);
  paint(0);

  const scratch = document.createElement("canvas");
  scratch.width = bitmapEdge;
  scratch.height = bitmapEdge;
  const ctx = scratch.getContext("2d");
  if (!ctx) return { frames: [], cssSize };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const frames: ImageBitmap[] = [];
  const abandon = () => {
    frames.forEach((bitmap) => bitmap.close());
    return { frames: [] as ImageBitmap[], cssSize };
  };
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    if (!isCurrent()) return abandon();
    const degree = index * FRAME_STEP_DEGREES;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bitmapEdge, bitmapEdge);
    ctx.translate(bitmapEdge / 2, bitmapEdge / 2);
    ctx.rotate((degree * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    const bitmap = await createImageBitmap(scratch);
    frames.push(bitmap);
    if (index === 0) onFirst?.(bitmap, cssSize);
    if (index % 24 === 23) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { frames, cssSize };
}

const ACCEPTED = /^(image\/png|image\/jpeg|image\/webp|image\/gif|image\/svg\+xml)$/;
const ACCEPTED_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;

export function isGoboImageFile(file: File) {
  return ACCEPTED.test(file.type) || ACCEPTED_EXT.test(file.name);
}

/** Decode one still. GIF keeps its first frame. SVG is rasterized. */
export async function rasterizeGoboFile(file: File) {
  if (!isGoboImageFile(file)) throw new Error("unsupported");
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const naturalW = image.naturalWidth || 512;
    const naturalH = image.naturalHeight || 512;
    const scale = Math.min(1, 1024 / Math.max(naturalW, naturalH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(naturalW * scale));
    canvas.height = Math.max(2, Math.round(naturalH * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("unsupported");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("unsupported"));
    image.src = url;
  });
}

/**
 * Fit the picture so its long side is `cssLongSide`, key it once, then spin that
 * still through the same fixed square the text gobo uses.
 */
export async function renderImageGoboFrames(
  master: HTMLCanvasElement,
  cssLongSide: number,
  key: KeyParams,
  onFirst?: (bitmap: ImageBitmap, cssSize: number) => void,
  isCurrent: () => boolean = () => true,
): Promise<GoboFrameSet> {
  const longSide = Math.max(8, cssLongSide);
  const aspect = master.width / Math.max(1, master.height);
  const drawW = aspect >= 1 ? longSide : longSide * aspect;
  const drawH = aspect >= 1 ? longSide / aspect : longSide;
  const cssSize = Math.max(8, Math.ceil(Math.hypot(drawW, drawH)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const deviceEdge = Math.ceil(cssSize * dpr);
  const bitmapScale = deviceEdge > MAX_DEVICE_EDGE ? MAX_DEVICE_EDGE / deviceEdge : 1;
  const bitmapEdge = Math.max(2, Math.round(cssSize * dpr * bitmapScale));
  const pixelW = Math.max(2, Math.round(drawW * dpr * bitmapScale));
  const pixelH = Math.max(2, Math.round(drawH * dpr * bitmapScale));

  const keyed = document.createElement("canvas");
  keyed.width = pixelW;
  keyed.height = pixelH;
  const keyedCtx = keyed.getContext("2d", { willReadFrequently: true });
  if (!keyedCtx) return { frames: [], cssSize };
  keyedCtx.imageSmoothingEnabled = true;
  keyedCtx.imageSmoothingQuality = "high";
  keyedCtx.drawImage(master, 0, 0, pixelW, pixelH);
  const image = keyedCtx.getImageData(0, 0, pixelW, pixelH);
  keyPixels(image.data, key);
  keyedCtx.putImageData(image, 0, 0);

  const scratch = document.createElement("canvas");
  scratch.width = bitmapEdge;
  scratch.height = bitmapEdge;
  const ctx = scratch.getContext("2d");
  if (!ctx) return { frames: [], cssSize };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const frames: ImageBitmap[] = [];
  const abandon = () => {
    frames.forEach((bitmap) => bitmap.close());
    return { frames: [] as ImageBitmap[], cssSize };
  };
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    if (!isCurrent()) return abandon();
    const degree = index * FRAME_STEP_DEGREES;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bitmapEdge, bitmapEdge);
    ctx.translate(bitmapEdge / 2, bitmapEdge / 2);
    ctx.rotate((degree * Math.PI) / 180);
    ctx.drawImage(keyed, -pixelW / 2, -pixelH / 2);
    const bitmap = await createImageBitmap(scratch);
    frames.push(bitmap);
    if (index === 0) onFirst?.(bitmap, cssSize);
    if (index % 24 === 23) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { frames, cssSize };
}
