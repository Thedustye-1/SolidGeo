import * as THREE from 'three';

export interface LabelOptions {
  theme: 'dark' | 'light';
  accent?: string;
  small?: boolean;
  muted?: boolean;
  plain?: boolean;
}

interface LabelTextureEntry {
  texture: THREE.CanvasTexture;
  aspect: number;
}

const textureCache = new Map<string, LabelTextureEntry>();

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function makeLabelTexture(text: string, options: LabelOptions): LabelTextureEntry {
  const key = `${text}|${options.theme}|${options.accent ?? ''}|${options.small ? 1 : 0}|${options.muted ? 1 : 0}|${options.plain ? 1 : 0}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const dark = options.theme === 'dark';
  const fontPx = options.small ? 34 : 42;
  const font = `650 ${fontPx}px "Segoe UI Variable", "Microsoft YaHei UI", "Segoe UI", sans-serif`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const textWidth = Math.ceil(measure.measureText(text).width);
  const height = 84;
  const padX = options.plain ? 4 : 18;
  const width = Math.max(28, textWidth + padX * 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  ctx.font = font;

  if (!options.plain) {
    ctx.save();
    ctx.shadowColor = dark ? 'rgba(0,0,0,.42)' : 'rgba(15,23,42,.12)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundedRect(ctx, 3, 10, width - 6, height - 20, 13);
    ctx.fillStyle = options.muted
      ? dark
        ? 'rgba(9,17,31,.62)'
        : 'rgba(255,255,255,.62)'
      : dark
        ? 'rgba(8,14,26,.82)'
        : 'rgba(255,255,255,.9)';
    ctx.fill();
    ctx.restore();

    roundedRect(ctx, 3, 10, width - 6, height - 20, 13);
    ctx.strokeStyle = options.accent ?? (dark ? 'rgba(148,163,184,.3)' : 'rgba(71,85,105,.18)');
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  ctx.fillStyle = options.accent ?? (options.plain ? (dark ? '#e2e8f0' : '#1e293b') : dark ? '#f1f5f9' : '#0f172a');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const entry = { texture, aspect: width / height };
  textureCache.set(key, entry);
  return entry;
}

export class LabelSprite {
  public readonly sprite: THREE.Sprite;
  private text = '';
  private options: LabelOptions = { theme: 'dark' };
  private aspect = 1;

  constructor(text: string, options: LabelOptions) {
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.sprite.renderOrder = 30;
    this.sprite.raycast = () => {};
    this.setText(text, options);
  }

  setText(text: string, options: LabelOptions) {
    if (
      text === this.text &&
      options.theme === this.options.theme &&
      options.accent === this.options.accent &&
      options.small === this.options.small &&
      options.muted === this.options.muted &&
      options.plain === this.options.plain
    ) {
      return;
    }
    this.text = text;
    this.options = { ...options };
    const { texture, aspect } = makeLabelTexture(text, options);
    const material = this.sprite.material as THREE.SpriteMaterial;
    material.map = texture;
    material.needsUpdate = true;
    this.aspect = aspect;
    const height = options.plain ? 0.34 : options.small ? 0.30 : 0.38;
    this.sprite.scale.set(height * aspect, height, 1);
  }

  setPosition(pos: THREE.Vector3 | [number, number, number]) {
    if (Array.isArray(pos)) this.sprite.position.set(pos[0], pos[1], pos[2]);
    else this.sprite.position.copy(pos);
  }
}
