import type {
  Anchor,
  Entity,
  MeasurementItem,
  PlaneDef,
  Polygon3D,
  RelationItem,
  SelectionRef,
  SolidEntity,
  Vec3,
  VectorSteps,
} from './types';
import {
  acuteLineAngle,
  add,
  angleBetween,
  angleDeg,
  clamp,
  cross,
  DEG,
  directionCosines,
  dist,
  dot,
  fmt,
  fmtVec,
  len,
  len2,
  lineLineClosest,
  linePlaneIntersection,
  meshSurfaceArea,
  meshVolume,
  mid,
  mul,
  norm,
  planePlaneIntersection,
  pointLineDistance,
  pointPlaneDistance,
  polygon3D,
  polygonArea,
  polygonNormal,
  polygonPerimeter,
  projectionVector,
  stitchSegments,
  sub,
  triangleArea,
  trianglePlaneIntersection,
  triangulateFace,
  v3,
  veq,
} from './math';
import {
  describeAnchor,
  entityDisplayType,
  resolveAnchor,
  resolveCircle,
  resolvePlane,
  resolveSegment,
  resolveVector,
  sectionArea,
  sectionPolygons,
  solidMetrics,
  solidTriangles,
} from './entities';

export interface GeomBase {
  ref: SelectionRef;
  label: string;
  entity: Entity;
}

export interface PointGeom extends GeomBase {
  kind: 'point';
  pos: Vec3;
}
export interface LineGeom extends GeomBase {
  kind: 'line';
  a: Vec3;
  b: Vec3;
  dir: Vec3;
  infinite: boolean;
}
export interface PlaneGeom extends GeomBase {
  kind: 'plane';
  point: Vec3;
  normal: Vec3;
  boundary?: Vec3[];
}
export interface CircleGeom extends GeomBase {
  kind: 'circle';
  center: Vec3;
  normal: Vec3;
  radius: number;
  sweep: number;
}
export interface VectorGeom extends GeomBase {
  kind: 'vector';
  origin: Vec3;
  value: Vec3;
}
export interface SolidGeom extends GeomBase {
  kind: 'solid';
  solid: SolidEntity;
}
export interface FaceGeom extends GeomBase {
  kind: 'face';
  points: Vec3[];
  normal: Vec3;
  centroid: Vec3;
  area: number;
  plane: PlaneDef;
}
export interface SectionGeom extends GeomBase {
  kind: 'section';
  polygons: Polygon3D[];
  planePoint: Vec3;
  planeNormal: Vec3;
}
export type Geom = PointGeom | LineGeom | PlaneGeom | CircleGeom | VectorGeom | SolidGeom | FaceGeom | SectionGeom;

export function selectionLabel(ref: SelectionRef, entities: Entity[]): string {
  const e = entities.find((x) => x.id === ref.id);
  if (!e) return '已删除图元';
  if (e.type === 'solid' && ref.part) {
    if (ref.part.kind === 'vertex') {
      const name = e.vertexNames[ref.part.index];
      return `${e.name} · 顶点 ${name || ref.part.index + 1}`;
    }
    if (ref.part.kind === 'edge') {
      const edge = e.edges[ref.part.index];
      if (edge) {
        return `${e.name} · 棱 ${e.vertexNames[edge[0]] || '?'}${e.vertexNames[edge[1]] || '?'}`;
      }
      return `${e.name} · 棱`;
    }
    if (ref.part.kind === 'face') return `${e.name} · 面 ${ref.part.index + 1}`;
  }
  return e.name;
}

export function resolveSelection(ref: SelectionRef, entities: Entity[]): Geom | null {
  const entity = entities.find((e) => e.id === ref.id);
  if (!entity || !entity.visible) return entity ? null : null;
  const label = selectionLabel(ref, entities);
  switch (entity.type) {
    case 'point':
      return { kind: 'point', ref, label, entity, pos: entity.pos };
    case 'segment': {
      const s = resolveSegment(entity, entities);
      if (!s) return null;
      return { kind: 'line', ref, label, entity, a: s.a, b: s.b, dir: s.dir, infinite: false };
    }
    case 'line': {
      const s = resolveSegment(entity, entities);
      if (!s) return null;
      return { kind: 'line', ref, label, entity, a: s.a, b: s.b, dir: s.dir, infinite: true };
    }
    case 'plane': {
      const p = resolvePlane(entity.definition, entities);
      if (!p) return null;
      return { kind: 'plane', ref, label, entity, point: p.point, normal: p.normal };
    }
    case 'circle': {
      const c = resolveCircle(entity, entities);
      if (!c) return null;
      return {
        kind: 'circle',
        ref,
        label,
        entity,
        center: c.center,
        normal: c.normal,
        radius: c.radius,
        sweep: c.sweep,
      };
    }
    case 'vector': {
      const v = resolveVector(entity, entities);
      if (!v) return null;
      return { kind: 'vector', ref, label, entity, origin: v.origin, value: v.value };
    }
    case 'solid': {
      if (ref.part?.kind === 'vertex') {
        const pos = entity.vertices[ref.part.index];
        if (!pos) return null;
        return { kind: 'point', ref, label, entity, pos };
      }
      if (ref.part?.kind === 'edge') {
        const edge = entity.edges[ref.part.index];
        if (!edge) return null;
        const a = entity.vertices[edge[0]];
        const b = entity.vertices[edge[1]];
        return { kind: 'line', ref, label, entity, a, b, dir: sub(b, a), infinite: false };
      }
      if (ref.part?.kind === 'face') {
        const face = entity.faces[ref.part.index];
        if (!face) return null;
        const points = face.map((i) => entity.vertices[i]);
        const poly = polygon3D(points);
        const plane: PlaneDef = { kind: 'free', point: poly.centroid, normal: poly.normal };
        return {
          kind: 'face',
          ref,
          label,
          entity,
          points,
          normal: poly.normal,
          centroid: poly.centroid,
          area: poly.area,
          plane,
        };
      }
      return { kind: 'solid', ref, label, entity, solid: entity };
    }
    case 'section': {
      const polygons = sectionPolygons(entity, entities);
      if (!polygons.length) return null;
      const plane = resolvePlane(entity.plane, entities);
      if (!plane) return null;
      return {
        kind: 'section',
        ref,
        label,
        entity,
        polygons,
        planePoint: plane.point,
        planeNormal: plane.normal,
      };
    }
    case 'trail':
      return null;
  }
}

export function resolveAll(refs: SelectionRef[], entities: Entity[]): Geom[] {
  return refs.map((r) => resolveSelection(r, entities)).filter((g): g is Geom => Boolean(g));
}

export function geomAnchor(geom: Geom): Anchor | null {
  if (geom.kind === 'point') {
    if (geom.entity.type === 'point') return { kind: 'point', id: geom.entity.id };
    if (geom.entity.type === 'solid' && geom.ref.part?.kind === 'vertex') {
      return { kind: 'solidVertex', id: geom.entity.id, index: geom.ref.part.index };
    }
  }
  return null;
}

export function geomPlane(geom: Geom): { point: Vec3; normal: Vec3 } | null {
  if (geom.kind === 'plane') return { point: geom.point, normal: geom.normal };
  if (geom.kind === 'face') return { point: geom.centroid, normal: geom.normal };
  if (geom.kind === 'section') return { point: geom.planePoint, normal: geom.planeNormal };
  return null;
}

export function geomPoint(geom: Geom): Vec3 | null {
  if (geom.kind === 'point') return geom.pos;
  if (geom.kind === 'circle') return geom.center;
  if (geom.kind === 'face') return geom.centroid;
  if (geom.kind === 'solid') return solidMetrics(geom.solid).centroid;
  return null;
}

export function lineDirection(geom: Geom): Vec3 | null {
  if (geom.kind === 'line') return geom.dir;
  if (geom.kind === 'vector') return geom.value;
  return null;
}

export function lineFrom(geom: Geom): { point: Vec3; dir: Vec3; infinite: boolean } | null {
  if (geom.kind === 'line') return { point: geom.a, dir: geom.dir, infinite: geom.infinite };
  if (geom.kind === 'vector') return { point: geom.origin, dir: geom.value, infinite: false };
  return null;
}

function isPointName(g: Geom): string {
  return g.label;
}

function relation(kind: RelationItem['kind'], label: string, between: string, detail?: string): RelationItem {
  return { kind, label, between, detail };
}

export function selectionRelations(refs: SelectionRef[], entities: Entity[]): RelationItem[] {
  const geoms = resolveAll(refs, entities);
  const out: RelationItem[] = [];
  const between = geoms.map((g) => g.label).join(' × ');

  // Multi-point collinearity / coplanarity.
  const points = geoms.filter((g) => g.kind === 'point') as PointGeom[];
  if (points.length >= 3 && points.length === geoms.length) {
    const collinear = pointsAreCollinear(points.map((p) => p.pos));
    out.push(
      collinear
        ? relation('collinear', '共线', between, '所有选中点位于同一直线上')
        : relation('coplanar', '不共线', between, '存在不共线的点'),
    );
    if (collinear) out.push(relation('coplanar', '共面', between, '共线的点必共面'));
  }
  if (points.length >= 4 && points.length === geoms.length) {
    out.push(
      pointsAreCoplanar(points.map((p) => p.pos))
        ? relation('coplanar', '共面', between, '四点位于同一平面内')
        : relation('unknown', '不共面', between, '四点构成空间四边形'),
    );
  }

  for (let i = 0; i < geoms.length; i += 1) {
    for (let j = i + 1; j < geoms.length; j += 1) {
      const pair = classifyPair(geoms[i], geoms[j]);
      if (pair) out.push(pair);
    }
  }
  return dedupeRelations(out).slice(0, 18);
}

function dedupeRelations(items: RelationItem[]): RelationItem[] {
  const seen = new Set<string>();
  return items.filter((r) => {
    const key = `${r.kind}|${r.between}|${r.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function pointsAreCollinear(points: Vec3[]): boolean {
  if (points.length < 3) return true;
  const base = points[0];
  let dir: Vec3 | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const d = sub(points[i], base);
    if (len(d) > 1e-7) {
      dir = d;
      break;
    }
  }
  if (!dir) return true;
  return points.every((p) => pointLineDistance(p, base, dir) < 1e-5);
}

export function pointsAreCoplanar(points: Vec3[]): boolean {
  if (points.length < 4) return true;
  const base = points[0];
  let normal: Vec3 | null = null;
  for (let i = 1; i < points.length - 1; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const n = cross(sub(points[i], base), sub(points[j], base));
      if (len(n) > 1e-7) {
        normal = norm(n);
        break;
      }
    }
    if (normal) break;
  }
  if (!normal) return true;
  return points.every((p) => Math.abs(dot(sub(p, base), normal!)) < 1e-5);
}

function classifyPair(a: Geom, b: Geom): RelationItem | null {
  const between = `${a.label} × ${b.label}`;

  if (a.kind === 'point' && b.kind === 'point') {
    return dist(a.pos, b.pos) < 1e-6
      ? relation('coincident', '重合', between, '两点坐标相同')
      : null;
  }

  if ((a.kind === 'point' && b.kind === 'line') || (a.kind === 'line' && b.kind === 'point')) {
    const p = a.kind === 'point' ? a : (b as PointGeom);
    const l = a.kind === 'line' ? a : (b as LineGeom);
    const d = pointLineDistance(p.pos, l.a, l.dir);
    if (d < 1e-6) return relation('contain', '点在直线上', between, `点 ${p.label} 在 ${l.label} 上`);
    return null;
  }

  if ((a.kind === 'point' && b.kind === 'plane') || (a.kind === 'plane' && b.kind === 'point')) {
    const p = a.kind === 'point' ? a : (b as PointGeom);
    const pl = a.kind === 'plane' ? a : (b as PlaneGeom);
    if (pointPlaneDistance(p.pos, pl.point, pl.normal) < 1e-6) {
      return relation('contain', '点在平面内', between, `点 ${p.label} 在 ${pl.label} 内`);
    }
    return null;
  }

  if (a.kind === 'line' && b.kind === 'line') {
    const angle = acuteLineAngle(a.dir, b.dir);
    const closest = lineLineClosest(a.a, a.dir, b.b, b.dir);
    if (angle < 0.35) {
      if (closest.distance < 1e-6) return relation('coincident', '共线 / 重合', between, '两直线在同一直线上');
      return relation('parallel', '平行 ∥', between, `两直线方向相同，距离 ${fmt(closest.distance, 3)}`);
    }
    if (closest.distance < 1e-6) {
      const tA = closest.t;
      const sB = closest.s;
      const inside = (!a.infinite ? tA >= -1e-6 && tA <= 1 + 1e-6 : true) &&
        (!b.infinite ? sB >= -1e-6 && sB <= 1 + 1e-6 : true);
      const perp = Math.abs(angle - 90) < 0.35;
      return relation(
        perp ? 'perpendicular' : 'intersect',
        perp ? '垂直 ⟂' : '相交',
        between,
        inside ? `交点为 ${fmtVec(add(a.a, mul(a.dir, tA)), 2)}` : '所在直线相交，线段本身不相交',
      );
    }
    const perp = Math.abs(angle - 90) < 0.35;
    return relation(
      'skew',
      perp ? '异面且方向垂直' : '异面',
      between,
      `异面直线所成角 ${fmt(angle, 2)}°，公垂距离 ${fmt(closest.distance, 3)}`,
    );
  }

  if ((a.kind === 'line' && b.kind === 'plane') || (a.kind === 'plane' && b.kind === 'line')) {
    const l = a.kind === 'line' ? a : (b as LineGeom);
    const pl = a.kind === 'plane' ? a : (b as PlaneGeom);
    const d = norm(l.dir);
    const n = norm(pl.normal);
    const sinTheta = Math.abs(dot(d, n));
    if (sinTheta < 1e-4) {
      if (pointPlaneDistance(l.a, pl.point, pl.normal) < 1e-6) {
        return relation('contain', '直线在平面内', between, '直线的所有点在平面内');
      }
      return relation('parallel', '线面平行 ∥', between, `直线到平面距离 ${fmt(pointPlaneDistance(l.a, pl.point, pl.normal), 3)}`);
    }
    if (sinTheta > 0.9999) return relation('perpendicular', '线面垂直 ⟂', between, '直线方向与平面法向量平行');
    const theta = Math.asin(clamp(sinTheta, 0, 1)) * DEG;
    return relation('intersect', '线面斜交', between, `线面角 ${fmt(theta, 2)}°`);
  }

  if (
    (a.kind === 'plane' && b.kind === 'face') ||
    (a.kind === 'face' && b.kind === 'plane') ||
    (a.kind === 'face' && b.kind === 'face') ||
    (a.kind === 'plane' && b.kind === 'plane')
  ) {
    const pa = geomPlane(a)!;
    const pb = geomPlane(b)!;
    const cosA = Math.abs(dot(norm(pa.normal), norm(pb.normal)));
    const planeAngle = Math.acos(clamp(cosA, 0, 1)) * DEG;
    if (cosA > 0.9999) {
      const d = pointPlaneDistance(pb.point, pa.point, pa.normal);
      if (d < 1e-6) return relation('coincident', '共面 / 重合', between, '两个平面重合');
      return relation('parallel', '平行 ∥', between, `平行平面间距 ${fmt(d, 3)}`);
    }
    if (cosA < 0.0001) return relation('perpendicular', '垂直 ⟂', between, '两个平面的法向量互相垂直');
    return relation(
      'intersect',
      '相交',
      between,
      `二面角 ${fmt(planeAngle, 2)}° 或 ${fmt(180 - planeAngle, 2)}°`,
    );
  }

  if (a.kind === 'vector' && b.kind === 'vector') {
    const ang = acuteLineAngle(a.value, b.value);
    if (ang < 0.35) return relation('parallel', '向量平行 / 共线', between, '方向相同或相反');
    if (Math.abs(ang - 90) < 0.35) return relation('perpendicular', '向量垂直 ⟂', between, '点积为 0');
    return relation('intersect', '向量夹角', between, `夹角 ${fmt(ang, 2)}°`);
  }

  if ((a.kind === 'vector' && b.kind === 'line') || (a.kind === 'line' && b.kind === 'vector')) {
    const v = a.kind === 'vector' ? a : (b as VectorGeom);
    const l = a.kind === 'line' ? a : (b as LineGeom);
    const ang = acuteLineAngle(v.value, l.dir);
    if (ang < 0.35) return relation('parallel', '向量与直线平行', between, '方向相同或相反');
    if (Math.abs(ang - 90) < 0.35) return relation('perpendicular', '向量与直线垂直', between, '方向垂直');
  }

  if ((a.kind === 'circle' && b.kind === 'plane') || (a.kind === 'plane' && b.kind === 'circle')) {
    const c = a.kind === 'circle' ? a : (b as CircleGeom);
    const p = a.kind === 'plane' ? a : (b as PlaneGeom);
    const d = pointPlaneDistance(c.center, p.point, p.normal);
    if (Math.abs(Math.abs(dot(c.normal, p.normal)) - 1) < 1e-4 && d < 1e-6) {
      return relation('contain', '圆在平面内', between, '圆所在平面与给定平面重合');
    }
    if (Math.abs(dot(c.normal, p.normal)) < 1e-4) {
      return relation('perpendicular', '圆所在平面与平面垂直', between, '法向量互相垂直');
    }
  }

  if (a.kind === 'solid' && b.kind === 'solid') {
    const va = solidMetrics(a.solid).volume;
    const vb = solidMetrics(b.solid).volume;
    if (va > 0 && Math.abs(va - vb) / Math.max(va, vb) < 1e-3) {
      return relation('equal', '体积相等', between, `体积均约为 ${fmt(va, 3)}`);
    }
  }

  if ((a.kind === 'solid' && b.kind === 'plane') || (a.kind === 'plane' && b.kind === 'solid')) {
    const s = a.kind === 'solid' ? a : (b as SolidGeom);
    const p = a.kind === 'plane' ? a : (b as PlaneGeom);
    const poly = sectionFromSolidPlane(s.solid, { kind: 'free', point: p.point, normal: p.normal });
    if (poly.length) {
      return relation('intersect', '平面与立体相交', between, `截得 ${poly.length} 个截面多边形`);
    }
  }

  return null;
}

export function sectionFromSolidPlane(solid: SolidEntity, plane: PlaneDef): Polygon3D[] {
  const p = plane.kind === 'free' ? plane : null;
  if (!p) return [];
  const segments: Array<[Vec3, Vec3]> = [];
  for (const [a, b, c] of solidTriangles(solid)) {
    const seg = trianglePlaneIntersection(
      solid.vertices[a],
      solid.vertices[b],
      solid.vertices[c],
      p.point,
      p.normal,
    );
    if (seg) segments.push(seg);
  }
  if (!segments.length) return [];
  return stitchSegments(segments).map((points) => polygon3D(points));
}

export interface PairMeasure extends MeasurementItem {}

export function selectionMetrics(refs: SelectionRef[], entities: Entity[]): MeasurementItem[] {
  const geoms = resolveAll(refs, entities);
  const items: MeasurementItem[] = [];
  const points = geoms.filter((g) => g.kind === 'point') as PointGeom[];
  const lines = geoms.filter((g) => g.kind === 'line') as LineGeom[];
  const planes = geoms.filter((g) => g.kind === 'plane' || g.kind === 'face') as Array<PlaneGeom | FaceGeom>;
  const circles = geoms.filter((g) => g.kind === 'circle') as CircleGeom[];
  const vectors = geoms.filter((g) => g.kind === 'vector') as VectorGeom[];
  const solids = geoms.filter((g) => g.kind === 'solid') as SolidGeom[];

  for (const p of points) {
    items.push({
      label: `点 ${p.label} 坐标`,
      value: fmtVec(p.pos, 3),
      detail: `到原点距离 ${fmt(len(p.pos), 3)}`,
    });
  }
  for (const l of lines) {
    items.push({
      label: `${l.infinite ? '直线' : '线段'} ${l.label} 长度`,
      value: l.infinite ? '无限延伸' : fmt(len(l.dir), 4),
      detail: `方向向量 ${fmtVec(norm(l.dir), 3)}`,
    });
    if (l.infinite) {
      items.push({ label: `${l.label} 已知两点距离`, value: fmt(len(l.dir), 4) });
    }
  }
  for (const c of circles) {
    const arc = Math.abs(c.sweep) * c.radius;
    items.push({
      label: `${c.label} 半径`,
      value: fmt(c.radius, 4),
      detail: `弧长 ${fmt(arc, 4)} · 扇形面积 ${fmt(0.5 * c.radius * c.radius * Math.abs(c.sweep), 4)}`,
    });
    if (Math.abs(Math.abs(c.sweep) - Math.PI * 2) < 1e-6) {
      items.push({ label: '圆周长', value: fmt(2 * Math.PI * c.radius, 4) });
      items.push({ label: '圆面积', value: fmt(Math.PI * c.radius * c.radius, 4) });
    }
  }
  for (const v of vectors) {
    items.push({ label: `向量 ${v.label} 模长`, value: fmt(len(v.value), 4) });
    items.push({ label: '单位向量', value: fmtVec(directionCosines(v.value), 4) });
  }
  for (const p of planes) {
    const n = p.kind === 'plane' ? p.normal : p.normal;
    const pt = p.kind === 'plane' ? p.point : p.centroid;
    items.push({
      label: `${p.label} 法向量`,
      value: fmtVec(norm(n), 4),
      detail: `平面方程 ${fmt(n[0], 3)}x + ${fmt(n[1], 3)}y + ${fmt(n[2], 3)}z + ${fmt(-dot(norm(n), pt), 3)} = 0`,
    });
    if (p.kind === 'face') items.push({ label: '面面积', value: fmt(p.area, 4) });
  }
  for (const s of solids) {
    const m = solidMetrics(s.solid);
    items.push({
      label: `${s.label} 表面积`,
      value: fmt(m.surfaceArea, 4),
      detail: m.exact ? '参数精确值' : '网格数值积分',
    });
    items.push({
      label: `${s.label} 体积`,
      value: fmt(m.volume, 4),
      detail: m.exact ? '参数精确值' : '网格数值积分',
    });
    items.push({
      label: '拓扑',
      value: `${m.vertexCount} 顶点 · ${m.edgeCount} 棱 · ${m.faceCount} 面`,
      detail: `重心 ${fmtVec(m.centroid, 3)}`,
    });
  }

  if (points.length === 2) {
    items.unshift({
      label: '两点距离',
      value: fmt(dist(points[0].pos, points[1].pos), 4),
      detail: `${points[0].label} → ${points[1].label}`,
    });
  }
  if (points.length === 3) {
    const [a, b, c] = points;
    items.unshift({
      label: '三角形面积',
      value: fmt(triangleArea(a.pos, b.pos, c.pos), 4),
      detail: `周长 ${fmt(dist(a.pos, b.pos) + dist(b.pos, c.pos) + dist(c.pos, a.pos), 4)}`,
    });
  }
  if (points.length >= 1 && lines.length >= 1) {
    for (const p of points) {
      for (const l of lines) {
        items.push({
          label: `点 ${p.label} 到 ${l.infinite ? '直线' : '线段'} ${l.label} 距离`,
          value: fmt(pointLineDistance(p.pos, l.a, l.dir), 4),
        });
      }
    }
  }
  if (points.length >= 1 && planes.length >= 1) {
    for (const p of points) {
      for (const pl of planes) {
        const pt = pl.kind === 'plane' ? pl.point : pl.centroid;
        const n = pl.kind === 'plane' ? pl.normal : pl.normal;
        items.push({
          label: `点 ${p.label} 到 ${pl.label} 距离`,
          value: fmt(pointPlaneDistance(p.pos, pt, n), 4),
        });
      }
    }
  }
  if (lines.length === 2) {
    const [a, b] = lines;
    const ang = acuteLineAngle(a.dir, b.dir);
    const closest = lineLineClosest(a.a, a.dir, b.b, b.dir);
    items.unshift({
      label: '两直线所成角',
      value: `${fmt(ang, 3)}°`,
      detail: closest.distance < 1e-6 ? '相交 / 共面' : `异面，公垂距离 ${fmt(closest.distance, 4)}`,
    });
    items.push({ label: '两直线距离', value: fmt(closest.distance, 4) });
  }
  if (lines.length === 1 && planes.length >= 1) {
    const [l, pl] = [lines[0], planes[0]];
    const pt = pl.kind === 'plane' ? pl.point : pl.centroid;
    const n = pl.kind === 'plane' ? pl.normal : pl.normal;
    const sinTheta = Math.abs(dot(norm(l.dir), norm(n)));
    items.unshift({
      label: '线面角',
      value: `${fmt(Math.asin(clamp(sinTheta, 0, 1)) * DEG, 3)}°`,
      detail: `点线距离 ${fmt(pointLineDistance(pt, l.a, l.dir), 4)}`,
    });
  }
  if (planes.length === 2) {
    const pa = planes[0];
    const pb = planes[1];
    const na = pa.kind === 'plane' ? pa.normal : pa.normal;
    const nb = pb.kind === 'plane' ? pb.normal : pb.normal;
    const cosA = Math.abs(dot(norm(na), norm(nb)));
    const angle = Math.acos(clamp(cosA, 0, 1)) * DEG;
    items.unshift({
      label: '二面角',
      value: `${fmt(angle, 3)}° / ${fmt(180 - angle, 3)}°`,
      detail: '无向平面给出互补的两个二面角，按图中方向取其一',
    });
    if (cosA > 0.9999) {
      const ptB = pb.kind === 'plane' ? pb.point : pb.centroid;
      const ptA = pa.kind === 'plane' ? pa.point : pa.centroid;
      items.push({ label: '平行平面间距', value: fmt(pointPlaneDistance(ptB, ptA, na), 4) });
    }
  }
  if (vectors.length === 2) {
    const [a, b] = vectors;
    const dotv = dot(a.value, b.value);
    const ang = angleDeg(a.value, b.value);
    items.unshift({ label: '向量点积 a·b', value: fmt(dotv, 4) });
    items.push({ label: '向量夹角', value: `${fmt(ang, 3)}°` });
    items.push({ label: '叉积 a×b', value: fmtVec(cross(a.value, b.value), 4), detail: `模长 ${fmt(len(cross(a.value, b.value)), 4)}` });
    items.push({ label: 'b 在 a 上的投影', value: fmtVec(projectionVector(b.value, a.value), 4) });
  }
  if (solids.length >= 1 && planes.length >= 1) {
    for (const s of solids) {
      for (const pl of planes) {
        const pt = pl.kind === 'plane' ? pl.point : pl.centroid;
        const n = pl.kind === 'plane' ? pl.normal : pl.normal;
        const poly = sectionFromSolidPlane(s.solid, { kind: 'free', point: pt, normal: n });
        items.push({
          label: `截面积 · ${s.label}`,
          value: fmt(poly.reduce((acc, p) => acc + p.area, 0), 4),
          detail: `${poly.length} 个截面多边形`,
        });
      }
    }
  }
  return items;
}

export type MeasureKind =
  | 'length'
  | 'angle'
  | 'linePlaneAngle'
  | 'dihedral'
  | 'skewAngle'
  | 'pointPlaneDistance'
  | 'surfaceArea'
  | 'volume';

export function runMeasure(kind: MeasureKind, refs: SelectionRef[], entities: Entity[]): MeasurementItem[] {
  const geoms = resolveAll(refs, entities);
  switch (kind) {
    case 'length': {
      const lines = geoms.filter((g): g is LineGeom => g.kind === 'line');
      const circles = geoms.filter((g): g is CircleGeom => g.kind === 'circle');
      if (lines[0]) {
        return [{
          label: lines[0].infinite ? '直线方向长度' : '线段长度',
          value: fmt(len(lines[0].dir), 4),
          detail: `${fmtVec(lines[0].a, 3)} → ${fmtVec(lines[0].b, 3)}`,
        }];
      }
      if (circles[0]) {
        return [{
          label: '弧长 / 周长',
          value: fmt(Math.abs(circles[0].sweep) * circles[0].radius, 4),
          detail: `半径 ${fmt(circles[0].radius, 3)}，圆心角 ${fmt(Math.abs(circles[0].sweep) * DEG, 2)}°`,
        }];
      }
      if (geoms.length >= 2 && geoms[0].kind === 'point' && geoms[1].kind === 'point') {
        return [{ label: '两点距离', value: fmt(dist(geoms[0].pos, geoms[1].pos), 4) }];
      }
      return [];
    }
    case 'angle': {
      const lines = geoms.filter((g): g is LineGeom => g.kind === 'line');
      if (lines.length >= 2) {
        return [{ label: '两线夹角', value: `${fmt(acuteLineAngle(lines[0].dir, lines[1].dir), 3)}°` }];
      }
      const pts = geoms.filter((g): g is PointGeom => g.kind === 'point');
      if (pts.length === 3) {
        const [a, b, c] = pts;
        return [{
          label: `∠${a.label}${b.label}${c.label}`,
          value: `${fmt(angleDeg(sub(a.pos, b.pos), sub(c.pos, b.pos)), 3)}°`,
          detail: '以第二个选中点为顶点',
        }];
      }
      return [];
    }
    case 'linePlaneAngle': {
      const l = geoms.find((g): g is LineGeom => g.kind === 'line');
      const p = geoms.find((g) => g.kind === 'plane' || g.kind === 'face');
      if (!l || !p) return [];
      const n = p.kind === 'plane' ? p.normal : p.normal;
      const sinv = Math.abs(dot(norm(l.dir), norm(n)));
      return [{
        label: '线面角',
        value: `${fmt(Math.asin(clamp(sinv, 0, 1)) * DEG, 3)}°`,
        detail: `sinθ = |l·n| / (|l||n|) = ${fmt(sinv, 4)}`,
      }];
    }
    case 'dihedral': {
      const ps = geoms.filter((g) => g.kind === 'plane' || g.kind === 'face');
      if (ps.length < 2) return [];
      const na = ps[0].kind === 'plane' ? ps[0].normal : ps[0].normal;
      const nb = ps[1].kind === 'plane' ? ps[1].normal : ps[1].normal;
      const angle = Math.acos(clamp(Math.abs(dot(norm(na), norm(nb))), 0, 1)) * DEG;
      return [{
        label: '二面角',
        value: `${fmt(angle, 3)}° 或 ${fmt(180 - angle, 3)}°`,
        detail: '两个半平面的夹角取决于方向；图中可结合法向量方向判断',
      }];
    }
    case 'skewAngle': {
      const lines = geoms.filter((g): g is LineGeom => g.kind === 'line');
      if (lines.length < 2) return [];
      const closest = lineLineClosest(lines[0].a, lines[0].dir, lines[1].b, lines[1].dir);
      return [{
        label: '异面直线所成角',
        value: `${fmt(acuteLineAngle(lines[0].dir, lines[1].dir), 3)}°`,
        detail: `公垂线段距离 ${fmt(closest.distance, 4)}`,
      }];
    }
    case 'pointPlaneDistance': {
      const p = geoms.find((g): g is PointGeom => g.kind === 'point');
      const pl = geoms.find((g) => g.kind === 'plane' || g.kind === 'face');
      if (!p || !pl) return [];
      return [{
        label: '点到平面距离',
        value: fmt(pointPlaneDistance(p.pos, pl.kind === 'plane' ? pl.point : pl.centroid, pl.kind === 'plane' ? pl.normal : pl.normal), 4),
        detail: `垂足 ${fmtVec(sub(p.pos, mul(norm(pl.kind === 'plane' ? pl.normal : pl.normal), pointPlaneDistance(p.pos, pl.kind === 'plane' ? pl.point : pl.centroid, pl.kind === 'plane' ? pl.normal : pl.normal))), 3)}`,
      }];
    }
    case 'surfaceArea': {
      const solids = geoms.filter((g): g is SolidGeom => g.kind === 'solid');
      if (solids[0]) {
        const m = solidMetrics(solids[0].solid);
        return [{ label: `${solids[0].label} 表面积`, value: fmt(m.surfaceArea, 4), detail: m.exact ? '精确公式' : '网格积分' }];
      }
      return [];
    }
    case 'volume': {
      const solids = geoms.filter((g): g is SolidGeom => g.kind === 'solid');
      if (solids[0]) {
        const m = solidMetrics(solids[0].solid);
        return [{ label: `${solids[0].label} 体积`, value: fmt(m.volume, 4), detail: m.exact ? '精确公式' : '网格积分' }];
      }
      return [];
    }
  }
}

export function vectorStepsForLinePlane(refs: SelectionRef[], entities: Entity[]): VectorSteps | null {
  const geoms = resolveAll(refs, entities);
  const line = geoms.find((g): g is LineGeom => g.kind === 'line');
  const plane = geoms.find((g) => g.kind === 'plane' || g.kind === 'face');
  if (!line || !plane) return null;
  const l = norm(line.dir);
  const n = norm(plane.kind === 'plane' ? plane.normal : plane.normal);
  const sinv = Math.abs(dot(l, n));
  const theta = Math.asin(clamp(sinv, 0, 1)) * DEG;
  return {
    title: '向量法求线面角',
    steps: [
      `取直线方向向量 l = ${fmtVec(l, 4)}`,
      `取平面法向量 n = ${fmtVec(n, 4)}`,
      `l · n = ${fmt(dot(l, n), 4)}，|l| = ${fmt(len(l), 4)}，|n| = ${fmt(len(n), 4)}`,
      `sin θ = |l · n| / (|l||n|) = ${fmt(sinv, 4)}`,
      `θ = arcsin(${fmt(sinv, 4)}) = ${fmt(theta, 3)}°`,
    ],
    result: `线面角 θ = ${fmt(theta, 3)}°`,
    value: theta,
  };
}

export function vectorStepsForDihedral(refs: SelectionRef[], entities: Entity[]): VectorSteps | null {
  const geoms = resolveAll(refs, entities);
  const planes = geoms.filter((g) => g.kind === 'plane' || g.kind === 'face');
  if (planes.length < 2) return null;
  const a = planes[0];
  const b = planes[1];
  const n1 = norm(a.kind === 'plane' ? a.normal : a.normal);
  const n2 = norm(b.kind === 'plane' ? b.normal : b.normal);
  const cosv = clamp(dot(n1, n2), -1, 1);
  const phi = Math.acos(cosv) * DEG;
  return {
    title: '向量法求二面角',
    steps: [
      `取半平面法向量 n₁ = ${fmtVec(n1, 4)}`,
      `取半平面法向量 n₂ = ${fmtVec(n2, 4)}`,
      `n₁ · n₂ = ${fmt(dot(n1, n2), 4)}`,
      `cos φ = n₁·n₂ / (|n₁||n₂|) = ${fmt(cosv, 4)}`,
      `φ = arccos(${fmt(cosv, 4)}) = ${fmt(phi, 3)}°`,
      '观察法向量指向半平面同侧或异侧，二面角取 φ 或 180° − φ。',
    ],
    result: `二面角 = ${fmt(phi, 3)}° 或 ${fmt(180 - phi, 3)}°`,
    value: phi,
  };
}

export function selectedVectorsInfo(refs: SelectionRef[], entities: Entity[]): Array<{
  id: string;
  label: string;
  origin: Vec3;
  value: Vec3;
  magnitude: number;
  unit: Vec3;
  cosines: Vec3;
}> {
  const geoms = resolveAll(refs, entities);
  return geoms
    .filter((g): g is VectorGeom => g.kind === 'vector')
    .map((v) => ({
      id: v.entity.id,
      label: v.label,
      origin: v.origin,
      value: v.value,
      magnitude: len(v.value),
      unit: directionCosines(v.value),
      cosines: directionCosines(v.value),
    }));
}

export function nearestAnchorInfo(anchor: Anchor, entities: Entity[]) {
  return describeAnchor(anchor, entities);
}

export function pointToSolidDistance(point: Vec3, solid: SolidEntity): number {
  let best = Infinity;
  for (const [a, b, c] of solidTriangles(solid)) {
    best = Math.min(best, pointTriangleDistance(point, solid.vertices[a], solid.vertices[b], solid.vertices[c]));
  }
  return best;
}

function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dist(p, a);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dist(p, b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return dist(p, add(a, mul(ab, v)));
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dist(p, c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return dist(p, add(a, mul(ac, w)));
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return dist(p, add(b, mul(sub(c, b), w)));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return dist(p, add(a, add(mul(ab, v), mul(ac, w))));
}

export { sectionArea, sectionPolygons };

export function summarizeSelection(refs: SelectionRef[], entities: Entity[]): string {
  return refs
    .map((r) => selectionLabel(r, entities))
    .slice(0, 4)
    .join('、') + (refs.length > 4 ? ` 等 ${refs.length} 项` : '');
}
