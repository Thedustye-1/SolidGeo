import * as THREE from 'three';
import type { Entity, Polygon3D, SceneSettings, SelectionRef, SolidEntity, Vec3, ViewportId } from '../core/types';
import {
  add,
  fmt,
  makeCirclePoints,
  mul,
  norm,
  sub,
  triangulateFace,
} from '../core/math';
import {
  resolveCircle,
  resolvePlane,
  resolveSegment,
  resolveVector,
  sectionPolygons,
} from '../core/entities';

export interface ExportEdgeData {
  visible: number[];
  hidden: number[];
}

export interface SVGExportInput {
  camera: THREE.Camera;
  width: number;
  height: number;
  theme: 'dark' | 'light';
  settings: SceneSettings;
  entities: Entity[];
  selection: SelectionRef[];
  viewport: ViewportId;
  edgesFor: (solid: SolidEntity) => ExportEdgeData;
}

interface ScreenPoint {
  x: number;
  y: number;
  z: number;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function project(p: Vec3, camera: THREE.Camera, width: number, height: number): ScreenPoint {
  const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    z: v.z,
  };
}

function line(points: ScreenPoint[], stroke: string, width = 1.5, dash = '', opacity = 1): string {
  if (points.length < 2) return '';
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''} opacity="${opacity}"/>`;
}

function polygon(points: ScreenPoint[], fill: string, stroke: string, strokeWidth = 1, opacity = 1, fillOpacity = 0.14): string {
  if (points.length < 3) return '';
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
  return `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}

const VIEW_LABELS: Record<ViewportId, string> = {
  perspective: '透视主视口',
  front: '正视图（正交）',
  top: '俯视图（正交）',
  left: '左视图（正交）',
};

export function exportSVG(input: SVGExportInput): string {
  const { camera, width, height, theme, settings, entities, selection } = input;
  const aspect = Math.max(0.5, width / Math.max(1, height));
  const W = 1800;
  const H = Math.round(W / aspect);
  const dark = theme === 'dark';
  const bg0 = dark ? '#0b1220' : '#f8fafc';
  const bg1 = dark ? '#111827' : '#e8eef7';
  const gridColor = dark ? '#334155' : '#cbd5e1';
  const textColor = dark ? '#e2e8f0' : '#0f172a';
  const muted = dark ? '#94a3b8' : '#64748b';
  const solidEdgeColor = dark ? '#dbeafe' : '#1e293b';
  const hiddenEdgeColor = dark ? '#7c8ba1' : '#94a3b8';
  camera.updateMatrixWorld();
  const P = (p: Vec3) => project(p, camera, W, H);
  const parts: string[] = [];

  parts.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg0}"/><stop offset="1" stop-color="${bg1}"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);

  // Background grid in the projection plane of the active viewport.
  if (settings.showGrid) {
    const gridLines: string[] = [];
    const extent = 10;
    for (let i = -extent; i <= extent; i += 1) {
      let a: Vec3;
      let b: Vec3;
      if (input.viewport === 'front') {
        a = [-extent, 0, i];
        b = [extent, 0, i];
      } else if (input.viewport === 'left') {
        a = [0, -extent, i];
        b = [0, extent, i];
      } else {
        a = [i, -extent, 0];
        b = [i, extent, 0];
      }
      gridLines.push(line([P(a), P(b)], gridColor, 1, '', 0.38));
      if (input.viewport === 'front') {
        a = [i, 0, -extent];
        b = [i, 0, extent];
      } else if (input.viewport === 'left') {
        a = [-extent, i, 0];
        b = [extent, i, 0];
      } else {
        a = [-extent, i, 0];
        b = [extent, i, 0];
      }
      gridLines.push(line([P(a), P(b)], gridColor, 1, '', 0.38));
    }
    parts.push(`<g>${gridLines.join('')}</g>`);
  }

  // Axes.
  if (settings.showAxes) {
    const origin = P([0, 0, 0]);
    for (const [axis, color] of [
      [[4.5, 0, 0], '#f87171'],
      [[0, 4.5, 0], '#4ade80'],
      [[0, 0, 4.5], '#60a5fa'],
    ] as Array<[Vec3, string]>) {
      parts.push(line([origin, P(axis)], color, 2, '', 0.95));
      const end = P(axis);
      const lx = end.x + (end.x - origin.x) * 0.035;
      const ly = end.y + (end.y - origin.y) * 0.035;
      parts.push(`<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" fill="${color}"/>`);
    }
  }

  const selectedIds = new Set(selection.filter((s) => !s.part).map((s) => s.id));
  const selectedPartIds = new Set(selection.filter((s) => s.part).map((s) => s.id));

  // Solid faces (back to front) and edges.
  const solidFaces: Array<{ depth: number; svg: string }> = [];
  const solidEdges: string[] = [];
  const solidLabels: string[] = [];
  for (const entity of entities) {
    if (entity.type !== 'solid' || !entity.visible) continue;
    const projected = entity.vertices.map((p) => P(p));
    for (let fi = 0; fi < entity.faces.length; fi += 1) {
      const face = entity.faces[fi];
      for (const tri of triangulateFace(entity.vertices, face)) {
        const pts = tri.map((i) => projected[i]);
        const depth = (pts[0].z + pts[1].z + pts[2].z) / 3;
        const col = selectedPartIds.has(entity.id) || selectedIds.has(entity.id) ? '#f59e0b' : entity.color;
        solidFaces.push({
          depth,
          svg: polygon(pts, col, col, 0.7, 1, selectedPartIds.has(entity.id) || selectedIds.has(entity.id) ? 0.26 : 0.12),
        });
      }
    }
    const edges = input.edgesFor(entity);
    const flatToLines = (arr: number[], color: string, width: number, dash: string) => {
      for (let i = 0; i + 5 < arr.length; i += 6) {
        const a = P([arr[i], arr[i + 1], arr[i + 2]]);
        const b = P([arr[i + 3], arr[i + 4], arr[i + 5]]);
        solidEdges.push(line([a, b], color, width, dash, 1));
      }
    };
    const selected = selectedIds.has(entity.id) || selectedPartIds.has(entity.id);
    flatToLines(edges.visible, selected ? '#fbbf24' : solidEdgeColor, selected ? 2.4 : 1.7, '');
    if (settings.showHidden) flatToLines(edges.hidden, selected ? '#f59e0b' : hiddenEdgeColor, 1.15, '5 4');
    for (let i = 0; i < entity.vertices.length; i += 1) {
      if (!entity.vertexNames[i]) continue;
      const p = projected[i];
      solidLabels.push(
        `<text x="${(p.x + 7).toFixed(1)}" y="${(p.y - 7).toFixed(1)}" fill="${textColor}" font-size="17" font-weight="600" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(entity.vertexNames[i])}</text>`,
      );
    }
  }
  solidFaces.sort((a, b) => b.depth - a.depth);
  parts.push(`<g>${solidFaces.map((f) => f.svg).join('')}</g>`);

  // Planes.
  for (const entity of entities) {
    if (entity.type !== 'plane' || !entity.visible) continue;
    const plane = resolvePlane(entity.definition, entities);
    if (!plane) continue;
    const n = plane.normal;
    const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    const u = norm([helper[1] * n[2] - helper[2] * n[1], helper[2] * n[0] - helper[0] * n[2], helper[0] * n[1] - helper[1] * n[0]]);
    const v = norm([n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]);
    const center = plane.point;
    const size = entity.size;
    const c = [
      add(center, add(mul(u, -size / 2), mul(v, -size / 2))),
      add(center, add(mul(u, size / 2), mul(v, -size / 2))),
      add(center, add(mul(u, size / 2), mul(v, size / 2))),
      add(center, add(mul(u, -size / 2), mul(v, size / 2))),
    ].map(P);
    parts.push(polygon(c, entity.color, entity.color, 1.4, 1, 0.12));
  }

  // Sections.
  for (const entity of entities) {
    if (entity.type !== 'section' || !entity.visible) continue;
    for (const poly of sectionPolygons(entity, entities)) {
      const pts = poly.points.map(P);
      parts.push(polygon(pts, '#fb7185', '#fb7185', 2, 1, 0.22));
      parts.push(line([...pts, pts[0]], '#fb7185', 2.4));
    }
  }

  // User geometry.
  for (const entity of entities) {
    if (!entity.visible) continue;
    if (entity.type === 'segment' || entity.type === 'line') {
      const s = resolveSegment(entity, entities);
      if (!s) continue;
      let a = s.a;
      let b = s.b;
      if (entity.type === 'line') {
        const d = norm(sub(s.b, s.a));
        a = sub(s.a, mul(d, 30));
        b = add(s.b, mul(d, 30));
      }
      const selected = selectedIds.has(entity.id) || selectedPartIds.has(entity.id);
      parts.push(line([P(a), P(b)], selected ? '#fbbf24' : entity.color, selected ? 3.4 : 2.2));
    }
    if (entity.type === 'point') {
      const p = P(entity.pos);
      const selected = selectedIds.has(entity.id);
      parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${selected ? 6 : 4.6}" fill="${selected ? '#fbbf24' : textColor}" stroke="${selected ? '#f59e0b' : '#38bdf8'}" stroke-width="1.5"/>`);
      parts.push(`<text x="${(p.x + 8).toFixed(1)}" y="${(p.y - 8).toFixed(1)}" fill="${textColor}" font-size="18" font-weight="600" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(entity.name)}</text>`);
    }
    if (entity.type === 'circle') {
      const c = resolveCircle(entity, entities);
      if (!c) continue;
      const pts = makeCirclePoints(c.center, c.normal, c.radius, c.startAngle, c.sweep, 160).map(P);
      const selected = selectedIds.has(entity.id) || selectedPartIds.has(entity.id);
      parts.push(line(pts, selected ? '#fbbf24' : entity.color, selected ? 3.2 : 2.2));
    }
    if (entity.type === 'vector') {
      const v = resolveVector(entity, entities);
      if (!v) continue;
      const a = P(v.origin);
      const b = P(add(v.origin, v.value));
      const selected = selectedIds.has(entity.id) || selectedPartIds.has(entity.id);
      const color = selected ? '#fbbf24' : entity.color;
      parts.push(line([a, b], color, selected ? 3.6 : 2.6));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head = 12;
      const p1 = { x: b.x - head * Math.cos(angle - 0.42), y: b.y - head * Math.sin(angle - 0.42) };
      const p2 = { x: b.x - head * Math.cos(angle + 0.42), y: b.y - head * Math.sin(angle + 0.42) };
      parts.push(`<path d="M${b.x},${b.y} L${p1.x},${p1.y} L${p2.x},${p2.y} Z" fill="${color}"/>`);
      parts.push(`<text x="${(b.x + 8).toFixed(1)}" y="${(b.y - 8).toFixed(1)}" fill="${color}" font-size="16" font-weight="600" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(entity.name)}</text>`);
    }
    if (entity.type === 'trail' && entity.points.length > 1) {
      parts.push(line(entity.points.map(P), entity.color, 2, '', 0.9));
    }
  }

  parts.push(`<g>${solidEdges.join('')}</g>`);
  parts.push(`<g>${solidLabels.join('')}</g>`);

  parts.push(
    `<text x="26" y="34" fill="${textColor}" font-size="22" font-weight="600" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">SolidGeo · 立体几何</text>`,
    `<text x="26" y="58" fill="${muted}" font-size="15" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(VIEW_LABELS[input.viewport] ?? '当前视图')}</text>`,
    `<text x="${W - 24}" y="${H - 20}" text-anchor="end" fill="${muted}" font-size="13" font-family="Segoe UI, sans-serif">SolidGeo vector export · ${new Date().toLocaleString('zh-CN')}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${parts.join('\n')}
</svg>`;
}

export interface ThreeViewPanel {
  title: string;
  subtitle: string;
  camera: THREE.Camera;
  edges: Map<string, ExportEdgeData>;
}

export function exportThreeViewSVG(input: {
  panels: ThreeViewPanel[];
  entities: Entity[];
  theme: 'dark' | 'light';
  width?: number;
  height?: number;
}): string {
  const dark = input.theme === 'dark';
  const panelW = 760;
  const panelH = 720;
  const gap = 34;
  const margin = 58;
  const header = 128;
  const W = input.width ?? margin * 2 + panelW * 3 + gap * 2;
  const H = input.height ?? header + panelH + margin + 48;
  const text = dark ? '#e2e8f0' : '#0f172a';
  const muted = dark ? '#94a3b8' : '#64748b';
  const grid = dark ? '#334155' : '#cbd5e1';
  const edge = dark ? '#dbeafe' : '#1e293b';
  const hiddenEdge = dark ? '#7c8ba1' : '#94a3b8';
  const bg0 = dark ? '#0b1220' : '#f8fafc';
  const bg1 = dark ? '#111827' : '#e8eef7';
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  parts.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg0}"/><stop offset="1" stop-color="${bg1}"/></linearGradient></defs>`);
  parts.push(`<text x="${margin}" y="58" fill="${text}" font-size="30" font-weight="650" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">SolidGeo · 三视图</text>`);
  parts.push(`<text x="${margin}" y="86" fill="${muted}" font-size="14" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">正视图 / 俯视图 / 左视图 · 正交投影 · ${new Date().toLocaleString('zh-CN')}</text>`);

  input.panels.forEach((panel, index) => {
    const px = margin + index * (panelW + gap);
    const py = header;
    panel.camera.updateMatrixWorld();
    const P = (p: Vec3) => {
      const v = new THREE.Vector3(...p).project(panel.camera);
      return { x: (v.x * 0.5 + 0.5) * panelW, y: (-v.y * 0.5 + 0.5) * panelH, z: v.z };
    };
    parts.push(`<g transform="translate(${px},${py})">`);
    parts.push(`<rect x="0" y="0" width="${panelW}" height="${panelH}" rx="16" fill="${dark ? 'rgba(12,20,35,.6)' : 'rgba(255,255,255,.68)'}" stroke="${dark ? 'rgba(148,184,224,.18)' : 'rgba(30,64,110,.14)'}"/>`);
    parts.push(`<text x="24" y="36" fill="${text}" font-size="18" font-weight="600" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(panel.title)}</text>`);
    parts.push(`<text x="24" y="56" fill="${muted}" font-size="11" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(panel.subtitle)}</text>`);

    // Faint projection grid.
    for (let i = 1; i < 8; i += 1) {
      const x = (panelW / 8) * i;
      const y = (panelH / 8) * i;
      parts.push(`<line x1="${x}" y1="72" x2="${x}" y2="${panelH - 12}" stroke="${grid}" stroke-width="1" opacity=".18"/>`);
      parts.push(`<line x1="16" y1="${y}" x2="${panelW - 16}" y2="${y}" stroke="${grid}" stroke-width="1" opacity=".18"/>`);
    }

    // Faces, back to front.
    const faces: Array<{ depth: number; svg: string }> = [];
    for (const entity of input.entities) {
      if (entity.type !== 'solid' || !entity.visible) continue;
      const projected = entity.vertices.map(P);
      for (const face of entity.faces) {
        for (const tri of triangulateFace(entity.vertices, face)) {
          const pts = tri.map((i) => projected[i]);
          const depth = (pts[0].z + pts[1].z + pts[2].z) / 3;
          faces.push({
            depth,
            svg: polygon(pts, entity.color, entity.color, 0.6, 1, 0.10),
          });
        }
      }
    }
    faces.sort((a, b) => b.depth - a.depth);
    parts.push(faces.map((f) => f.svg).join(''));

    // Solid edges (per-view visibility).
    for (const entity of input.entities) {
      if (entity.type !== 'solid' || !entity.visible) continue;
      const edges = panel.edges.get(entity.id) ?? { visible: [], hidden: [] };
      const drawEdges = (arr: number[], color: string, width: number, dash: string) => {
        for (let i = 0; i + 5 < arr.length; i += 6) {
          const a = P([arr[i], arr[i + 1], arr[i + 2]]);
          const b = P([arr[i + 3], arr[i + 4], arr[i + 5]]);
          parts.push(line([a, b], color, width, dash, 1));
        }
      };
      drawEdges(edges.visible, edge, 1.6, '');
      drawEdges(edges.hidden, hiddenEdge, 1, '5 4');
      if (entity.labelIndices) {
        for (const vertexIndex of entity.labelIndices) {
          const name = entity.vertexNames[vertexIndex];
          const p = entity.vertices[vertexIndex];
          if (!name || !p) continue;
          const s = P(p);
          parts.push(`<text x="${(s.x + 5).toFixed(1)}" y="${(s.y - 5).toFixed(1)}" fill="${text}" font-size="14" font-weight="600" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(name)}</text>`);
        }
      }
    }

    // Other entities.
    for (const entity of input.entities) {
      if (!entity.visible) continue;
      if (entity.type === 'segment' || entity.type === 'line') {
        const s = resolveSegment(entity, input.entities);
        if (!s) continue;
        let a = s.a;
        let b = s.b;
        if (entity.type === 'line') {
          const d = norm(sub(s.b, s.a));
          a = sub(s.a, mul(d, 30));
          b = add(s.b, mul(d, 30));
        }
        parts.push(line([P(a), P(b)], '#38bdf8', 2.2));
      }
      if (entity.type === 'point') {
        const p = P(entity.pos);
        parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4" fill="${text}"/>`);
        parts.push(`<text x="${(p.x + 6).toFixed(1)}" y="${(p.y - 6).toFixed(1)}" fill="${text}" font-size="13" font-weight="600" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(entity.name)}</text>`);
      }
      if (entity.type === 'circle') {
        const c = resolveCircle(entity, input.entities);
        if (!c) continue;
        const pts = makeCirclePoints(c.center, c.normal, c.radius, c.startAngle, c.sweep, 120).map(P);
        parts.push(line(pts, '#f0abfc', 2));
      }
      if (entity.type === 'section') {
        for (const poly of sectionPolygons(entity, input.entities)) {
          const pts = poly.points.map(P);
          parts.push(polygon(pts, '#fb7185', '#fb7185', 1.6, 1, 0.18));
          parts.push(line([...pts, pts[0]], '#fb7185', 2));
        }
      }
    }
    parts.push(`</g>`);
  });
  parts.push(`<text x="${W - margin}" y="${H - 24}" text-anchor="end" fill="${muted}" font-size="12" font-family="Segoe UI, sans-serif">SolidGeo v2 · 三视图矢量导出</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${parts.join('\n')}
</svg>`;
}

export function exportOBJ(entities: Entity[]): string {
  const lines: string[] = ['# SolidGeo OBJ export', `# ${new Date().toISOString()}`, ''];
  let vertexOffset = 1;
  for (const entity of entities) {
    if (entity.type !== 'solid' || !entity.visible) continue;
    const solid = entity as SolidEntity;
    lines.push(`o ${solid.name.replace(/\s+/g, '_')}`);
    for (const v of solid.vertices) {
      lines.push(`v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`);
    }
    for (const face of solid.faces) {
      lines.push(`f ${face.map((i) => i + vertexOffset).join(' ')}`);
    }
    lines.push('');
    vertexOffset += solid.vertices.length;
  }
  if (lines.length <= 3) lines.push('# 场景中没有可导出的立体');
  return lines.join('\n');
}

export function exportSectionOBJ(polygons: Polygon3D[], name: string): string {
  const lines: string[] = [`# SolidGeo section export: ${name}`, `o ${name.replace(/\s+/g, '_')}`];
  let offset = 1;
  for (const poly of polygons) {
    for (const p of poly.points) lines.push(`v ${p[0].toFixed(6)} ${p[1].toFixed(6)} ${p[2].toFixed(6)}`);
    lines.push(`f ${poly.points.map((_, i) => i + offset).join(' ')}`);
    offset += poly.points.length;
  }
  lines.push(`# area = ${polygons.reduce((s, p) => s + p.area, 0).toFixed(6)}`);
  return lines.join('\n');
}

export function exportSectionSVG(
  polygons: Polygon3D[],
  name: string,
  camera: THREE.Camera,
  aspect: number,
  theme: 'dark' | 'light',
): string {
  const W = 1600;
  const H = Math.round(W / Math.max(0.5, aspect));
  const dark = theme === 'dark';
  camera.updateMatrixWorld();
  const P = (p: Vec3) => project(p, camera, W, H);
  const darkText = dark ? '#e2e8f0' : '#0f172a';
  const area = polygons.reduce((s, p) => s + p.area, 0);
  const all = polygons.flatMap((p) => p.points);
  const bounds = all.reduce(
    (acc, p) => {
      const s = P(p);
      acc.minX = Math.min(acc.minX, s.x);
      acc.maxX = Math.max(acc.maxX, s.x);
      acc.minY = Math.min(acc.minY, s.y);
      acc.maxY = Math.max(acc.maxY, s.y);
      return acc;
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const scale = Math.min(2.2, Math.max(0.4, Math.min((W * 0.62) / Math.max(1, bounds.maxX - bounds.minX), (H * 0.62) / Math.max(1, bounds.maxY - bounds.minY))));
  const project2 = (p: ScreenPoint) => ({
    x: (p.x - cx) * scale + W / 2,
    y: (p.y - cy) * scale + H / 2,
  });
  const polys = polygons
    .map((poly) => {
      const pts = poly.points.map(P).map(project2);
      return `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} Z" fill="#fb7185" fill-opacity=".2" stroke="#fb7185" stroke-width="3" stroke-linejoin="round"/>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark ? '#0b1220' : '#f8fafc'}"/><stop offset="1" stop-color="${dark ? '#111827' : '#e8eef7'}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="64" y="92" fill="${darkText}" font-size="34" font-weight="600" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">${esc(name)}</text>
  <text x="64" y="128" fill="${dark ? '#94a3b8' : '#64748b'}" font-size="20" font-family="Segoe UI, Microsoft YaHei UI, sans-serif">截面面积 S = ${fmt(area, 4)} · ${polygons.length} 个多边形 · ${polygons.reduce((s, p) => s + p.points.length, 0)} 个顶点</text>
  ${polys}
  <text x="${W - 48}" y="${H - 36}" text-anchor="end" fill="${dark ? '#94a3b8' : '#64748b'}" font-size="16" font-family="Segoe UI, sans-serif">SolidGeo section export</text>
</svg>`;
}
