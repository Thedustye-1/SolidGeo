import type {
  Anchor,
  CircleEntity,
  Entity,
  LineEntity,
  PlaneDef,
  PlaneEntity,
  PointEntity,
  Polygon3D,
  SectionEntity,
  SegmentEntity,
  SelectionRef,
  SolidEntity,
  SolidType,
  Vec3,
  VectorEntity,
  ResolvedVector,
} from './types';
import {
  add,
  bounds,
  cross,
  dist,
  fmtVec,
  len,
  meshCentroid,
  meshSurfaceArea,
  meshVolume,
  mul,
  norm,
  normalFrom3,
  polygon3D,
  stitchSegments,
  sub,
  trianglePlaneIntersection,
  triangulateFace,
  v3,
  veq,
} from './math';

let uidCounter = 0;
export function uid(prefix = 'e'): string {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export const PALETTE = [
  '#5eead4',
  '#7dd3fc',
  '#a78bfa',
  '#f0abfc',
  '#fda4af',
  '#fcd34d',
  '#86efac',
  '#f9a8d4',
  '#93c5fd',
  '#fdba74',
];

export const SOLID_NAMES: Record<SolidType, string> = {
  cube: '正方体',
  cuboid: '长方体',
  prism: '棱柱',
  pyramid: '棱锥',
  cylinder: '圆柱',
  cone: '圆锥',
  sphere: '球',
  tetra: '四面体',
  extrude: '拉伸体',
};

const SOLID_LABELS: Record<SolidType, string> = {
  cube: '正方体',
  cuboid: '长方体',
  prism: '棱柱',
  pyramid: '棱锥',
  cylinder: '圆柱',
  cone: '圆锥',
  sphere: '球体',
  tetra: '四面体',
  extrude: '拉伸体',
};

export function entityDisplayType(entity: Entity): string {
  switch (entity.type) {
    case 'point':
      return '点';
    case 'segment':
      return '线段';
    case 'line':
      return '直线';
    case 'plane':
      return '平面';
    case 'circle':
      return '圆 / 弧';
    case 'vector':
      return '向量';
    case 'solid':
      return SOLID_NAMES[entity.solidType];
    case 'section':
      return '截面';
    case 'trail':
      return '轨迹';
  }
}

export function entityIconKey(entity: Entity): string {
  return entity.type === 'solid' ? `solid-${entity.solidType}` : entity.type;
}

export function letterName(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const base = letters[index % 26];
  const round = Math.floor(index / 26);
  return round === 0 ? base : `${base}${round}`;
}

export function nextName(entities: Entity[], reserved: string[] = []): string {
  const used = new Set<string>(reserved);
  for (const e of entities) {
    if (e.type === 'point') used.add(e.name);
    if (e.type === 'solid') e.vertexNames.filter(Boolean).forEach((n) => used.add(n));
  }
  for (let i = 0; i < 1000; i += 1) {
    const candidate = letterName(i);
    if (!used.has(candidate)) return candidate;
  }
  return `P${used.size + 1}`;
}

export function allocateNames(entities: Entity[], count: number): string[] {
  const used: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = nextName(entities, used);
    used.push(name);
  }
  return used;
}

export function nextEntityName(entities: Entity[], type: string): string {
  const labels: Record<string, string> = {
    point: '点',
    segment: '线段',
    line: '直线',
    plane: '平面',
    circle: '圆',
    vector: '向量',
    section: '截面',
    trail: '轨迹',
  };
  const base = labels[type] ?? '图元';
  const used = new Set(entities.map((e) => e.name));
  let i = 1;
  while (used.has(`${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

export function solidDisplayName(entities: Entity[], solidType: SolidType): string {
  const base = SOLID_LABELS[solidType] ?? '几何体';
  const used = new Set(entities.map((e) => e.name));
  let i = 1;
  while (used.has(`${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

export function makePoint(entities: Entity[], pos: Vec3, name?: string): PointEntity {
  return {
    id: uid('pt'),
    type: 'point',
    name: name ?? nextName(entities),
    pos: [...pos] as Vec3,
    visible: true,
    color: '#f8fafc',
    createdAt: Date.now(),
  };
}

export function pointAnchor(id: string): Anchor {
  return { kind: 'point', id };
}

export function solidVertexAnchor(id: string, index: number): Anchor {
  return { kind: 'solidVertex', id, index };
}

export function anchorKey(anchor: Anchor): string {
  return anchor.kind === 'solidVertex' ? `${anchor.id}#${anchor.index}` : `${anchor.id}`;
}

export interface ResolvedAnchor {
  pos: Vec3;
  label: string;
  anchor: Anchor;
  entity?: Entity;
}

export function resolveAnchor(anchor: Anchor, entities: Entity[]): ResolvedAnchor | null {
  if (anchor.kind === 'point') {
    const e = entities.find((x) => x.id === anchor.id);
    if (!e || e.type !== 'point') return null;
    return { pos: e.pos, label: e.name, anchor, entity: e };
  }
  const e = entities.find((x) => x.id === anchor.id);
  if (!e || e.type !== 'solid' || anchor.index == null) return null;
  const pos = e.vertices[anchor.index];
  if (!pos) return null;
  return {
    pos,
    label: e.vertexNames[anchor.index] || `${e.name}.${anchor.index + 1}`,
    anchor,
    entity: e,
  };
}

export function anchorForSelection(ref: SelectionRef, entities: Entity[]): Anchor | null {
  const entity = entities.find((e) => e.id === ref.id);
  if (!entity) return null;
  if (entity.type === 'point' && !ref.part) return pointAnchor(entity.id);
  if (entity.type === 'solid' && ref.part?.kind === 'vertex') {
    return solidVertexAnchor(entity.id, ref.part.index);
  }
  return null;
}

export function resolveSegment(entity: SegmentEntity | LineEntity, entities: Entity[]) {
  const a = resolveAnchor(entity.a, entities);
  const b = resolveAnchor(entity.b, entities);
  if (!a || !b) return null;
  return { a: a.pos, b: b.pos, dir: sub(b.pos, a.pos), labelA: a.label, labelB: b.label };
}

export function resolvePlane(plane: PlaneDef, entities: Entity[]) {
  if (plane.kind === 'free') {
    return { point: plane.point, normal: norm(plane.normal), definition: plane };
  }
  const a = resolveAnchor(plane.a, entities);
  const b = resolveAnchor(plane.b, entities);
  const c = resolveAnchor(plane.c, entities);
  if (!a || !b || !c) return null;
  const n = normalFrom3(a.pos, b.pos, c.pos);
  if (len(n) < 0.5) return null;
  return { point: a.pos, normal: n, definition: plane, a, b, c };
}

export function resolveCircle(circle: CircleEntity, entities: Entity[]) {
  const center = resolveAnchor(circle.center, entities);
  if (!center) return null;
  return {
    center: center.pos,
    normal: norm(circle.normal),
    radius: circle.radius,
    sweep: circle.sweep,
    startAngle: circle.startAngle,
  };
}

export function resolveVector(vector: VectorEntity, entities: Entity[]): ResolvedVector | null {
  if (vector.definition.kind === 'free') {
    const value = vector.definition.value;
    return { origin: vector.definition.origin, value, magnitude: len(value) };
  }
  const a = resolveAnchor(vector.definition.a, entities);
  const b = resolveAnchor(vector.definition.b, entities);
  if (!a || !b) return null;
  const value = sub(b.pos, a.pos);
  return { origin: a.pos, value, magnitude: len(value) };
}

export function entityCenter(entity: Entity, entities: Entity[]): Vec3 | null {
  switch (entity.type) {
    case 'point':
      return entity.pos;
    case 'segment':
    case 'line': {
      const s = resolveSegment(entity, entities);
      return s ? mul(add(s.a, s.b), 0.5) : null;
    }
    case 'plane': {
      const p = resolvePlane(entity.definition, entities);
      return p?.point ?? null;
    }
    case 'circle': {
      const c = resolveCircle(entity, entities);
      return c?.center ?? null;
    }
    case 'vector': {
      const v = resolveVector(entity, entities);
      return v ? add(v.origin, mul(v.value, 0.5)) : null;
    }
    case 'solid':
      return meshCentroid(entity.vertices, entity.faces);
    case 'section':
      return sectionPolygons(entity, entities)[0]?.centroid ?? null;
    case 'trail':
      return entity.points[Math.floor(entity.points.length / 2)] ?? null;
  }
}

export function entityBounds(entity: Entity, entities: Entity[]): { center: Vec3; size: number } | null {
  switch (entity.type) {
    case 'point':
      return { center: entity.pos, size: 1 };
    case 'segment':
    case 'line': {
      const s = resolveSegment(entity, entities);
      if (!s) return null;
      return { center: mul(add(s.a, s.b), 0.5), size: Math.max(1, dist(s.a, s.b)) };
    }
    case 'plane': {
      const p = resolvePlane(entity.definition, entities);
      if (!p) return null;
      return { center: p.point, size: entity.size || 6 };
    }
    case 'circle': {
      const c = resolveCircle(entity, entities);
      return c ? { center: c.center, size: c.radius * 2 } : null;
    }
    case 'vector': {
      const v = resolveVector(entity, entities);
      return v ? { center: add(v.origin, mul(v.value, 0.5)), size: Math.max(1, v.magnitude) } : null;
    }
    case 'solid': {
      const b = bounds(entity.vertices);
      return { center: b.center, size: b.size };
    }
    case 'section': {
      const polys = sectionPolygons(entity, entities);
      const pts = polys.flatMap((p) => p.points);
      if (!pts.length) return null;
      const b = bounds(pts);
      return { center: b.center, size: b.size };
    }
    case 'trail': {
      if (!entity.points.length) return null;
      const b = bounds(entity.points);
      return { center: b.center, size: b.size };
    }
  }
}

export function makeBoxData(
  w: number,
  d: number,
  h: number,
  center: Vec3 = [0, 0, 0],
): { vertices: Vec3[]; faces: number[][]; edges: [number, number][] } {
  const [cx, cy, cz] = center;
  const x = w / 2;
  const y = d / 2;
  const z0 = cz;
  const z1 = cz + h;
  const vertices: Vec3[] = [
    [cx - x, cy - y, z0],
    [cx + x, cy - y, z0],
    [cx + x, cy + y, z0],
    [cx - x, cy + y, z0],
    [cx - x, cy - y, z1],
    [cx + x, cy - y, z1],
    [cx + x, cy + y, z1],
    [cx - x, cy + y, z1],
  ];
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return { vertices, faces, edges };
}

export function makePrismData(
  sides: number,
  radius: number,
  height: number,
  center: Vec3 = [0, 0, 0],
): { vertices: Vec3[]; faces: number[][]; edges: [number, number][] } {
  const n = Math.max(3, Math.round(sides));
  const [cx, cy, cz] = center;
  const vertices: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2 + Math.PI / 2;
    vertices.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), cz]);
  }
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2 + Math.PI / 2;
    vertices.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), cz + height]);
  }
  const faces: number[][] = [];
  faces.push(Array.from({ length: n }, (_, i) => n - 1 - i));
  faces.push(Array.from({ length: n }, (_, i) => n + i));
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    faces.push([i, j, n + j, n + i]);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    edges.push([i, (i + 1) % n]);
    edges.push([n + i, n + ((i + 1) % n)]);
    edges.push([i, n + i]);
  }
  return { vertices, faces, edges };
}

export function makePyramidData(
  sides: number,
  radius: number,
  height: number,
  center: Vec3 = [0, 0, 0],
): { vertices: Vec3[]; faces: number[][]; edges: [number, number][] } {
  const n = Math.max(3, Math.round(sides));
  const [cx, cy, cz] = center;
  const vertices: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2 + Math.PI / 2;
    vertices.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), cz]);
  }
  const apex = vertices.length;
  vertices.push([cx, cy, cz + height]);
  const faces: number[][] = [Array.from({ length: n }, (_, i) => n - 1 - i)];
  for (let i = 0; i < n; i += 1) faces.push([i, (i + 1) % n, apex]);
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    edges.push([i, (i + 1) % n]);
    edges.push([i, apex]);
  }
  return { vertices, faces, edges };
}

export function makeCylinderData(
  radius: number,
  height: number,
  center: Vec3 = [0, 0, 0],
  segments = 48,
): { vertices: Vec3[]; faces: number[][]; edges: [number, number][]; labelIndices: number[] } {
  const n = Math.max(12, Math.round(segments));
  const [cx, cy, cz] = center;
  const vertices: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    vertices.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), cz]);
  }
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    vertices.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), cz + height]);
  }
  const bottomCenter = vertices.length;
  vertices.push([cx, cy, cz]);
  const topCenter = vertices.length;
  vertices.push([cx, cy, cz + height]);
  const faces: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    faces.push([bottomCenter, j, i]);
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    faces.push([topCenter, n + i, n + j]);
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    faces.push([i, j, n + j, n + i]);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    edges.push([i, (i + 1) % n]);
    edges.push([n + i, n + ((i + 1) % n)]);
  }
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 8))) {
    edges.push([i, n + i]);
  }
  return { vertices, faces, edges, labelIndices: [bottomCenter, topCenter] };
}

export function makeConeData(
  radius: number,
  height: number,
  center: Vec3 = [0, 0, 0],
  segments = 48,
): { vertices: Vec3[]; faces: number[][]; edges: [number, number][]; labelIndices: number[] } {
  const n = Math.max(12, Math.round(segments));
  const [cx, cy, cz] = center;
  const vertices: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    vertices.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), cz]);
  }
  const baseCenter = vertices.length;
  vertices.push([cx, cy, cz]);
  const apex = vertices.length;
  vertices.push([cx, cy, cz + height]);
  const faces: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    faces.push([baseCenter, j, i]);
    faces.push([i, j, apex]);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i += 1) edges.push([i, (i + 1) % n]);
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 8))) edges.push([i, apex]);
  return { vertices, faces, edges, labelIndices: [baseCenter, apex] };
}

export function makeSphereData(
  radius: number,
  center: Vec3 = [0, 0, 0],
  widthSegments = 32,
  heightSegments = 20,
): { vertices: Vec3[]; faces: number[][]; edges: [number, number][]; labelIndices: number[] } {
  const ws = Math.max(12, Math.round(widthSegments));
  const hs = Math.max(8, Math.round(heightSegments));
  const [cx, cy, cz] = center;
  const vertices: Vec3[] = [];
  vertices.push([cx, cy, cz + radius]);
  for (let j = 1; j < hs; j += 1) {
    const phi = (j / hs) * Math.PI;
    const z = Math.cos(phi) * radius;
    const r = Math.sin(phi) * radius;
    for (let i = 0; i < ws; i += 1) {
      const theta = (i / ws) * Math.PI * 2;
      vertices.push([cx + r * Math.cos(theta), cy + r * Math.sin(theta), cz + z]);
    }
  }
  vertices.push([cx, cy, cz - radius]);
  const bottom = vertices.length - 1;
  const faces: number[][] = [];
  for (let i = 0; i < ws; i += 1) {
    faces.push([0, 1 + i, 1 + ((i + 1) % ws)]);
  }
  for (let j = 0; j < hs - 2; j += 1) {
    const row = 1 + j * ws;
    const next = row + ws;
    for (let i = 0; i < ws; i += 1) {
      const i2 = (i + 1) % ws;
      faces.push([row + i, next + i, next + i2, row + i2]);
    }
  }
  const lastRow = 1 + (hs - 2) * ws;
  for (let i = 0; i < ws; i += 1) {
    faces.push([bottom, lastRow + ((i + 1) % ws), lastRow + i]);
  }
  // Sparse display edges: equator + four meridians + two tropics.
  const edges: [number, number][] = [];
  const ringCount = hs - 1;
  const ring = (j: number) => 1 + j * ws;
  for (const j of [Math.floor(ringCount / 2), Math.floor(ringCount / 4), Math.floor((3 * ringCount) / 4)]) {
    for (let i = 0; i < ws; i += 1) edges.push([ring(j) + i, ring(j) + ((i + 1) % ws)]);
  }
  for (let m = 0; m < 4; m += 1) {
    const i = Math.floor((m * ws) / 4);
    edges.push([0, ring(0) + i]);
    for (let j = 0; j < ringCount - 1; j += 1) edges.push([ring(j) + i, ring(j + 1) + i]);
    edges.push([ring(ringCount - 1) + i, bottom]);
  }
  return { vertices, faces, edges, labelIndices: [] };
}

export function makeTetraData(
  size: number,
  center: Vec3 = [0, 0, 0],
): { vertices: Vec3[]; faces: number[][]; edges: [number, number][] } {
  const [cx, cy, cz] = center;
  const h = Math.sqrt(2 / 3) * size;
  const vertices: Vec3[] = [
    [cx - size / 2, cy - (size * Math.sqrt(3)) / 6, cz],
    [cx + size / 2, cy - (size * Math.sqrt(3)) / 6, cz],
    [cx, cy + (size * Math.sqrt(3)) / 3, cz],
    [cx, cy, cz + h],
  ];
  const faces = [
    [0, 2, 1],
    [0, 1, 3],
    [1, 2, 3],
    [2, 0, 3],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3],
  ];
  return { vertices, faces, edges };
}

export interface SolidBuild {
  vertices: Vec3[];
  faces: number[][];
  edges: [number, number][];
  labelIndices?: number[];
  params: Record<string, number>;
}

export function buildSolid(solidType: SolidType, params: Record<string, number>): SolidBuild {
  const center: Vec3 = [params.cx ?? 0, params.cy ?? 0, params.cz ?? 0];
  switch (solidType) {
    case 'cube': {
      const s = Math.max(0.1, params.size ?? 2);
      return { ...makeBoxData(s, s, s, center), params: { ...params, size: s } };
    }
    case 'cuboid': {
      const w = Math.max(0.1, params.w ?? 2.8);
      const d = Math.max(0.1, params.d ?? 1.8);
      const h = Math.max(0.1, params.h ?? 1.4);
      return { ...makeBoxData(w, d, h, center), params: { ...params, w, d, h } };
    }
    case 'prism': {
      const n = Math.max(3, Math.round(params.sides ?? 6));
      const r = Math.max(0.2, params.radius ?? 1.4);
      const h = Math.max(0.2, params.height ?? 2.2);
      return { ...makePrismData(n, r, h, center), params: { ...params, sides: n, radius: r, height: h } };
    }
    case 'pyramid': {
      const n = Math.max(3, Math.round(params.sides ?? 4));
      const r = Math.max(0.2, params.radius ?? 1.6);
      const h = Math.max(0.2, params.height ?? 2.4);
      return { ...makePyramidData(n, r, h, center), params: { ...params, sides: n, radius: r, height: h } };
    }
    case 'cylinder': {
      const r = Math.max(0.2, params.radius ?? 1.2);
      const h = Math.max(0.2, params.height ?? 2.4);
      const seg = Math.max(16, Math.round(params.segments ?? 48));
      return {
        ...makeCylinderData(r, h, center, seg),
        params: { ...params, radius: r, height: h, segments: seg },
      };
    }
    case 'cone': {
      const r = Math.max(0.2, params.radius ?? 1.3);
      const h = Math.max(0.2, params.height ?? 2.4);
      const seg = Math.max(16, Math.round(params.segments ?? 48));
      return {
        ...makeConeData(r, h, center, seg),
        params: { ...params, radius: r, height: h, segments: seg },
      };
    }
    case 'sphere': {
      const r = Math.max(0.2, params.radius ?? 1.3);
      return {
        ...makeSphereData(r, center),
        params: { ...params, radius: r },
      };
    }
    case 'tetra': {
      const s = Math.max(0.2, params.size ?? 2.2);
      return { ...makeTetraData(s, center), params: { ...params, size: s } };
    }
    case 'extrude':
      return {
        vertices: [],
        faces: [],
        edges: [],
        params: { ...params },
      };
  }
}

export function makeSolid(entities: Entity[], solidType: SolidType, params: Record<string, number>): SolidEntity {
  const build = buildSolid(solidType, params);
  const labelCount = build.labelIndices ? build.labelIndices.length : build.vertices.length;
  const names = allocateNames(entities, labelCount);
  const vertexNames = build.vertices.map(() => '');
  const labelIndices = build.labelIndices ?? build.vertices.map((_, i) => i);
  labelIndices.forEach((index, i) => {
    vertexNames[index] = names[i];
  });
  return {
    id: uid('solid'),
    type: 'solid',
    name: solidDisplayName(entities, solidType),
    solidType,
    params: build.params,
    vertices: build.vertices,
    faces: build.faces,
    edges: build.edges,
    vertexNames,
    labelIndices,
    deformed: false,
    opacity: 0.16,
    color: PALETTE[entities.length % PALETTE.length],
    visible: true,
    createdAt: Date.now(),
  };
}

export function makeExtrudedSolid(
  entities: Entity[],
  polygon: Vec3[],
  normal: Vec3,
  height: number,
): SolidEntity {
  const n = polygon.length;
  const nrm = norm(normal);
  const unique: Vec3[] = [];
  for (const p of polygon) {
    if (!unique.some((q) => veq(q, p, 1e-5))) unique.push(p);
  }
  if (unique.length < 3) throw new Error('截面至少需要三个不共线的点');
  const base = unique;
  const top = base.map((p) => add(p, mul(nrm, height)));
  const vertices = [...base, ...top];
  const count = base.length;
  const faces: number[][] = [];
  faces.push(Array.from({ length: count }, (_, i) => count - 1 - i));
  faces.push(Array.from({ length: count }, (_, i) => count + i));
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    faces.push([i, j, count + j, count + i]);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    edges.push([i, (i + 1) % count]);
    edges.push([count + i, count + ((i + 1) % count)]);
    edges.push([i, count + i]);
  }
  const names = allocateNames(entities, count * 2);
  const vertexNames = [...names];
  return {
    id: uid('solid'),
    type: 'solid',
    name: solidDisplayName(entities, 'extrude'),
    solidType: 'extrude',
    params: { height, baseSides: count },
    vertices,
    faces,
    edges,
    vertexNames,
    labelIndices: vertices.map((_, i) => i),
    deformed: true,
    opacity: 0.18,
    color: PALETTE[entities.length % PALETTE.length],
    visible: true,
    createdAt: Date.now(),
  };
}

export interface SolidMetrics {
  surfaceArea: number;
  volume: number;
  exact: boolean;
  centroid: Vec3;
  vertexCount: number;
  edgeCount: number;
  faceCount: number;
}

export function solidMetrics(solid: SolidEntity): SolidMetrics {
  const p = solid.params;
  let exactArea = 0;
  let exactVolume = 0;
  let exact = !solid.deformed;
  switch (solid.solidType) {
    case 'cube': {
      const s = p.size ?? 2;
      exactArea = 6 * s * s;
      exactVolume = s ** 3;
      break;
    }
    case 'cuboid': {
      const w = p.w ?? 2;
      const d = p.d ?? 2;
      const h = p.h ?? 2;
      exactArea = 2 * (w * d + w * h + d * h);
      exactVolume = w * d * h;
      break;
    }
    case 'prism': {
      const n = p.sides ?? 6;
      const r = p.radius ?? 1;
      const h = p.height ?? 2;
      const base = 0.5 * n * r * r * Math.sin((Math.PI * 2) / n);
      const perimeter = 2 * n * r * Math.sin(Math.PI / n);
      exactArea = 2 * base + perimeter * h;
      exactVolume = base * h;
      break;
    }
    case 'pyramid': {
      const n = p.sides ?? 4;
      const r = p.radius ?? 1;
      const h = p.height ?? 2;
      const base = 0.5 * n * r * r * Math.sin((Math.PI * 2) / n);
      const apothem = r * Math.cos(Math.PI / n);
      const slant = Math.sqrt(h * h + apothem * apothem);
      const perimeter = 2 * n * r * Math.sin(Math.PI / n);
      exactArea = base + 0.5 * perimeter * slant;
      exactVolume = (base * h) / 3;
      break;
    }
    case 'cylinder': {
      const r = p.radius ?? 1;
      const h = p.height ?? 2;
      exactArea = 2 * Math.PI * r * (r + h);
      exactVolume = Math.PI * r * r * h;
      break;
    }
    case 'cone': {
      const r = p.radius ?? 1;
      const h = p.height ?? 2;
      const l = Math.sqrt(r * r + h * h);
      exactArea = Math.PI * r * (r + l);
      exactVolume = (Math.PI * r * r * h) / 3;
      break;
    }
    case 'sphere': {
      const r = p.radius ?? 1;
      exactArea = 4 * Math.PI * r * r;
      exactVolume = (4 / 3) * Math.PI * r ** 3;
      break;
    }
    case 'tetra': {
      const s = p.size ?? 2;
      exactArea = Math.sqrt(3) * s * s;
      exactVolume = s ** 3 / (6 * Math.sqrt(2));
      break;
    }
    case 'extrude':
      exact = false;
      break;
  }
  return {
    surfaceArea: exact ? exactArea : meshSurfaceArea(solid.vertices, solid.faces),
    volume: exact ? exactVolume : meshVolume(solid.vertices, solid.faces),
    exact,
    centroid: meshCentroid(solid.vertices, solid.faces),
    vertexCount: solid.vertices.length,
    edgeCount: solid.edges.length,
    faceCount: solid.faces.length,
  };
}

export function solidTriangles(solid: SolidEntity): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  solid.faces.forEach((face, faceIndex) => {
    for (const tri of triangulateFace(solid.vertices, face)) out.push([tri[0], tri[1], tri[2], faceIndex]);
  });
  return out;
}

export function sectionPolygons(section: SectionEntity, entities: Entity[]): Polygon3D[] {
  const solid = entities.find((e) => e.id === section.solidId);
  if (!solid || solid.type !== 'solid') return [];
  const plane = resolvePlane(section.plane, entities);
  if (!plane) return [];
  const segments: Array<[Vec3, Vec3]> = [];
  for (const [a, b, c] of solidTriangles(solid)) {
    const seg = trianglePlaneIntersection(
      solid.vertices[a],
      solid.vertices[b],
      solid.vertices[c],
      plane.point,
      plane.normal,
    );
    if (seg) segments.push(seg);
  }
  return stitchSegments(segments).map((points) => polygon3D(points));
}

export function sectionArea(section: SectionEntity, entities: Entity[]): number {
  return sectionPolygons(section, entities).reduce((s, p) => s + p.area, 0);
}

export function makeSegment(entities: Entity[], a: Anchor, b: Anchor): SegmentEntity {
  return {
    id: uid('seg'),
    type: 'segment',
    name: nextEntityName(entities, 'segment'),
    a,
    b,
    visible: true,
    color: '#7dd3fc',
    createdAt: Date.now(),
  };
}

export function makeLine(entities: Entity[], a: Anchor, b: Anchor): LineEntity {
  return {
    id: uid('line'),
    type: 'line',
    name: nextEntityName(entities, 'line'),
    a,
    b,
    visible: true,
    color: '#a78bfa',
    createdAt: Date.now(),
  };
}

export function makePlane(
  entities: Entity[],
  definition: PlaneDef,
  options: { color?: string; size?: number } = {},
): PlaneEntity {
  return {
    id: uid('plane'),
    type: 'plane',
    name: nextEntityName(entities, 'plane'),
    definition,
    size: options.size ?? 5.5,
    visible: true,
    color: options.color ?? '#fcd34d',
    createdAt: Date.now(),
  };
}

export function makeCircle(
  entities: Entity[],
  center: Anchor,
  normal: Vec3,
  radius: number,
  sweep = Math.PI * 2,
  startAngle = 0,
): CircleEntity {
  return {
    id: uid('circle'),
    type: 'circle',
    name: nextEntityName(entities, 'circle'),
    center,
    normal,
    radius,
    sweep,
    startAngle,
    visible: true,
    color: '#f0abfc',
    createdAt: Date.now(),
  };
}

export function makeVector(
  entities: Entity[],
  definition: VectorEntity['definition'],
  name?: string,
): VectorEntity {
  return {
    id: uid('vec'),
    type: 'vector',
    name: name ?? nextEntityName(entities, 'vector'),
    definition,
    visible: true,
    color: '#fda4af',
    createdAt: Date.now(),
  };
}

export function makeSection(
  entities: Entity[],
  solidId: string,
  plane: PlaneDef,
  options: { clip?: boolean; fill?: boolean } = {},
): SectionEntity {
  return {
    id: uid('sec'),
    type: 'section',
    name: nextEntityName(entities, 'section'),
    solidId,
    plane,
    clip: options.clip ?? false,
    fill: options.fill ?? true,
    visible: true,
    color: '#fb7185',
    createdAt: Date.now(),
  };
}

export function anchorLabel(anchor: Anchor, entities: Entity[]): string {
  return resolveAnchor(anchor, entities)?.label ?? '?';
}

export function describeAnchor(anchor: Anchor, entities: Entity[]): string {
  const r = resolveAnchor(anchor, entities);
  return r ? `${r.label} ${fmtVec(r.pos)}` : '已失效';
}

export function triangleNormalAt(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return norm(cross(sub(b, a), sub(c, a)));
}
