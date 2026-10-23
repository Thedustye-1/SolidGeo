import type { ProjectFile, SelectionRef, Vec3, ViewportId } from '../core/types';

export interface ViewportController {
  resetViews: () => void;
  fitSelection: () => void;
  fitAll: () => void;
  toggleMainProjection: () => 'perspective' | 'orthographic';
  exportActivePNG: () => Promise<{ dataUrl: string; width: number; height: number }>;
  exportActiveSVG: () => string;
  exportThreeViewSVG: () => string;
  exportOBJ: () => string;
  exportSection: (sectionId: string, format: 'svg' | 'obj') => string | null;
  startTraceAnimation: () => boolean;
  startRevolveAnimation: () => boolean;
  pulseSelection: () => boolean;
  stopAnimations: () => void;
  setAutoRotate: (value: boolean) => void;
  getCameraState: () => import('../core/types').CameraState;
  screenshotCanvas: (viewport?: ViewportId) => HTMLCanvasElement | null;
}

let current: ViewportController | null = null;

export function registerViewportController(controller: ViewportController | null) {
  current = controller;
}

export function getViewportController(): ViewportController | null {
  return current;
}

export function exportFileName(extension: string, name = 'SolidGeo'): string {
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${name}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(
    stamp.getHours(),
  )}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.${extension}`;
}

export type { ProjectFile, SelectionRef, Vec3, ViewportId };
