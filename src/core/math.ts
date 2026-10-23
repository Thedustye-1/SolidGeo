import type { Polygon3D, Vec3 } from './types';

export const EPS = 1e-8;
export const DEG = 180 / Math.PI;

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len2 = (a: Vec3): number => dot(a, a);
export const len = (a: Vec3): number => Math.sqrt(len2(a));
export const dist2 = (a: Vec3, b: Vec3): number => len2(sub(a, b));
export const dist = (a: Vec3, b: Vec3): number => Math.sqrt(dist2(a, b));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const mid = (a: Vec3, b: Vec3): Vec3 => lerp(a, b, 0.5);

export function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l < EPS ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

export function eq(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

export function veq(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function angleBetween(a: Vec3, b: Vec3): number {
  const la = len(a);
  const lb = len(b);
  if (la < EPS || lb < EPS) return 0;
  return Math.acos(clamp(dot(a, b) / (la * lb), -1, 1));
}

export function angleDeg(a: Vec3, b: Vec3): number {
  return angleBetween(a, b) * DEG;
}

/** Acute angle between two undirected lines, in degrees. */
export function acuteLineAngle(a: Vec3, b: Vec3): number {
  const c = Math.abs(dot(norm(a), norm(b)));
  return Math.acos(clamp(c, -1, 1)) * DEG;
}

export function normalFrom3(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const n = cross(sub(b, a), sub(c, a));
  return norm(n);
}

export function planeEquation(point: Vec3, normal: Vec3): [number, number, number, number] {
  const n = norm(normal);
  return [n[0], n[1], n[2], -dot(n, point)];
}

export function signedPointPlaneDistance(p: Vec3, point: Vec3, normal: Vec3): number {
  return dot(sub(p, point), norm(normal));
}

export function pointPlaneDistance(p: Vec3, point: Vec3, normal: Vec3): number {
  return Math.abs(signedPointPlaneDistance(p, point, normal));
}

export function pointOnPlane(p: Vec3, point: Vec3, normal: Vec3, eps = 1e-6): boolean {
  return Math.abs(signedPointPlaneDistance(p, point, normal)) <= eps;
}

/** Closest point on infinite line p + t*d. */
export function closestOnLine(p: Vec3, d: Vec3, q: Vec3): { point: Vec3; t: number } {
  const dd = len2(d);
  if (dd < EPS) return { point: p, t: 0 };
  const t = dot(sub(q, p), d) / dd;
  return { point: add(p, mul(d, t)), t };
}

export function pointLineDistance(p: Vec3, linePoint: Vec3, dir: Vec3): number {
  const d = norm(dir);
  if (len(d) < EPS) return dist(p, linePoint);
  return len(cross(sub(p, linePoint), d));
}

export function footOnLine(p: Vec3, linePoint: Vec3, dir: Vec3): Vec3 {
  return closestOnLine(linePoint, dir, p).point;
}

export function footOnPlane(p: Vec3, planePoint: Vec3, normal: Vec3): Vec3 {
  const n = norm(normal);
  const t = dot(sub(p, planePoint), n);
  return sub(p, mul(n, t));
}

/** Closest pair between infinite lines p1+t*d1 and p2+s*d2. */
export function lineLineClosest(
  p1: Vec3,
  d1: Vec3,
  p2: Vec3,
  d2: Vec3,
): { a: Vec3; b: Vec3; t: number; s: number; distance: number; parallel: boolean } {
  const a = len2(d1);
  const b = dot(d1, d2);
  const c = len2(d2);
  const r = sub(p1, p2);
  const d = dot(d1, r);
  const e = dot(d2, r);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-9) {
    const t = a < EPS ? 0 : dot(sub(p2, p1), d1) / a;
    const pa = add(p1, mul(d1, t));
    const s = c < EPS ? 0 : dot(sub(pa, p2), d2) / c;
    const pb = add(p2, mul(d2, s));
    return { a: pa, b: pb, t, s, distance: dist(pa, pb), parallel: true };
  }
  const t = (b * e - c * d) / denom;
  const s = (a * e - b * d) / denom;
  const pa = add(p1, mul(d1, t));
  const pb = add(p2, mul(d2, s));
  return { a: pa, b: pb, t, s, distance: dist(pa, pb), parallel: false };
}

export function linePlaneIntersection(
  p: Vec3,
  d: Vec3,
  planePoint: Vec3,
  normal: Vec3,
): Vec3 | null {
  const n = norm(normal);
  const denom = dot(d, n);
  if (Math.abs(denom) < 1e-7) return null;
  const t = dot(sub(planePoint, p), n) / denom;
  return add(p, mul(d, t));
}

export function planePlaneIntersection(
  p1: Vec3,
  n1: Vec3,
  p2: Vec3,
  n2: Vec3,
): { point: Vec3; dir: Vec3 } | null {
  const d = cross(n1, n2);
  if (len(d) < 1e-7) return null;
  const p = add(
    mul(cross(n2, d), dot(p1, n1)),
    mul(cross(d, n1), dot(p2, n2)),
  );
  const denom = dot(d, d);
  return { point: mul(p, 1 / denom), dir: d };
}

/** Newell normal of an arbitrary 3D polygon. */
export function polygonNormal(points: Vec3[]): Vec3 {
  if (points.length < 3) return [0, 0, 1];
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const n = norm([nx, ny, nz]);
  return len(n) > 0.5 ? n : normalFrom3(points[0], points[1], points[2]);
}

export function polygonArea(points: Vec3[]): number {
  if (points.length < 3) return 0;
  let acc: Vec3 = [0, 0, 0];
  for (let i = 1; i < points.length - 1; i += 1) {
    acc = add(acc, cross(sub(points[i], points[0]), sub(points[i + 1], points[0])));
  }
  return len(acc) / 2;
}

export function polygonPerimeter(points: Vec3[], closed = true): number {
  let total = 0;
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i += 1) total += dist(points[i], points[(i + 1) % points.length]);
  return total;
}

export function polygonCentroid(points: Vec3[]): Vec3 {
  if (!points.length) return [0, 0, 0];
  if (points.length < 3) {
    return mul(points.reduce((acc, p) => add(acc, p), v3()), 1 / points.length);
  }
  const n = polygonNormal(points);
  const [ux, uy] = planeBasis(n);
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  const p0 = points[0];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const ax = dot(sub(a, p0), ux);
    const ay = dot(sub(a, p0), uy);
    const bx = dot(sub(b, p0), ux);
    const by = dot(sub(b, p0), uy);
    const cr = ax * by - bx * ay;
    area2 += cr;
    cx += (ax + bx) * cr;
    cy += (ay + by) * cr;
  }
  if (Math.abs(area2) < 1e-10) {
    return mul(points.reduce((acc, p) => add(acc, p), v3()), 1 / points.length);
  }
  cx /= 3 * area2;
  cy /= 3 * area2;
  return add(p0, add(mul(ux, cx), mul(uy, cy)));
}

export function polygon3D(points: Vec3[]): Polygon3D {
  return {
    points,
    normal: polygonNormal(points),
    area: polygonArea(points),
    centroid: polygonCentroid(points),
  };
}

export function planeBasis(normal: Vec3): [Vec3, Vec3] {
  const n = norm(normal);
  const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = norm(cross(helper, n));
  const v = norm(cross(n, u));
  return [u, v];
}

export function pointInPolygon3D(p: Vec3, points: Vec3[], normal?: Vec3): boolean {
  if (points.length < 3) return false;
  const n = normal ?? polygonNormal(points);
  const [u, v] = planeBasis(n);
  const pts = points.map((q) => [dot(sub(q, points[0]), u), dot(sub(q, points[0]), v)]);
  const target: [number, number] = [dot(sub(p, points[0]), u), dot(sub(p, points[0]), v)];
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > target[1] !== yj > target[1]) {
      const x = ((xj - xi) * (target[1] - yi)) / (yj - yi || 1e-12) + xi;
      if (target[0] < x) inside = !inside;
    }
  }
  return inside;
}

export function triangulateFace(points: Vec3[], face: number[]): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  if (face.length < 3) return out;
  // Ear-clipping on the best-fit plane for robustness on convex polygons.
  const poly = face.map((i) => points[i]);
  const n = polygonNormal(poly);
  const [u, v] = planeBasis(n);
  const p0 = poly[0];
  const coords = poly.map((q) => [dot(sub(q, p0), u), dot(sub(q, p0), v)] as [number, number]);
  let sign = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const a = coords[i];
    const b = coords[(i + 1) % coords.length];
    const d = coords[(i + 2) % coords.length];
    sign += (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
  }
  const ccw = sign >= 0;
  const idx = face.map((_, i) => i);
  let guard = 0;
  while (idx.length > 3 && guard < 500) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < idx.length; i += 1) {
      const ia = idx[(i - 1 + idx.length) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = coords[ia];
      const b = coords[ib];
      const c = coords[ic];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const convex = ccw ? cr > 1e-10 : cr < -1e-10;
      if (!convex) continue;
      let contains = false;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (pointInTriangle2D(coords[j], a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      out.push([face[ia], face[ib], face[ic]]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) {
    out.push([face[idx[0]], face[idx[1]], face[idx[2]]]);
  } else if (idx.length > 3) {
    for (let i = 1; i < idx.length - 1; i += 1) {
      out.push([face[idx[0]], face[idx[i]], face[idx[i + 1]]]);
    }
  }
  return out;
}

function pointInTriangle2D(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  c: [number, number],
): boolean {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  return len(cross(sub(b, a), sub(c, a))) / 2;
}

export function meshSurfaceArea(vertices: Vec3[], faces: number[][]): number {
  let area = 0;
  for (const face of faces) {
    for (const [a, b, c] of triangulateFace(vertices, face)) {
      area += triangleArea(vertices[a], vertices[b], vertices[c]);
    }
  }
  return area;
}

export function meshVolume(vertices: Vec3[], faces: number[][]): number {
  let vol = 0;
  for (const face of faces) {
    for (const [a, b, c] of triangulateFace(vertices, face)) {
      vol += dot(vertices[a], cross(vertices[b], vertices[c])) / 6;
    }
  }
  return Math.abs(vol);
}

export function meshCentroid(vertices: Vec3[], faces: number[][]): Vec3 {
  let vol = 0;
  let acc: Vec3 = [0, 0, 0];
  for (const face of faces) {
    for (const [a, b, c] of triangulateFace(vertices, face)) {
      const va = vertices[a];
      const vb = vertices[b];
      const vc = vertices[c];
      const v = dot(va, cross(vb, vc)) / 6;
      vol += v;
      acc = add(acc, mul(add(add(va, vb), vc), v / 4));
    }
  }
  if (Math.abs(vol) < 1e-9) {
    const all = vertices.reduce((s, p) => add(s, p), v3());
    return mul(all, 1 / Math.max(1, vertices.length));
  }
  return mul(acc, 1 / vol);
}

/** Intersection segment of a triangle with a plane. */
export function trianglePlaneIntersection(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  planePoint: Vec3,
  normal: Vec3,
): [Vec3, Vec3] | null {
  const n = norm(normal);
  const ds = [a, b, c].map((p) => dot(sub(p, planePoint), n));
  const eps = 1e-7;
  const pts: Vec3[] = [];
  const edges: Array<[Vec3, Vec3, number, number]> = [
    [a, b, ds[0], ds[1]],
    [b, c, ds[1], ds[2]],
    [c, a, ds[2], ds[0]],
  ];
  for (const [p, q, dp, dq] of edges) {
    if (Math.abs(dp) < eps) pts.push(p);
    if (dp * dq < -eps) {
      const t = dp / (dp - dq);
      pts.push(lerp(p, q, t));
    }
  }
  const unique: Vec3[] = [];
  for (const p of pts) {
    if (!unique.some((q) => veq(q, p, 1e-5))) unique.push(p);
  }
  if (unique.length < 2) return null;
  let best: [Vec3, Vec3] = [unique[0], unique[1]];
  let bestD = dist2(unique[0], unique[1]);
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const d = dist2(unique[i], unique[j]);
      if (d > bestD) {
        bestD = d;
        best = [unique[i], unique[j]];
      }
    }
  }
  return bestD > 1e-12 ? best : null;
}

/** Stitch unordered cutting segments into closed polygons. */
export function stitchSegments(segments: Array<[Vec3, Vec3]>, eps = 1e-5): Vec3[][] {
  if (!segments.length) return [];
  const points: Vec3[] = [];
  const key = (p: Vec3) => {
    for (let i = 0; i < points.length; i += 1) if (veq(points[i], p, eps)) return i;
    points.push(p);
    return points.length - 1;
  };
  const edges: Array<[number, number]> = [];
  for (const [a, b] of segments) {
    const ia = key(a);
    const ib = key(b);
    if (ia !== ib) edges.push([ia, ib]);
  }
  const adj = new Map<number, number[]>();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const used = new Set<string>();
  const loopKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const loops: Vec3[][] = [];
  for (const [startA, startB] of edges) {
    const ek = loopKey(startA, startB);
    if (used.has(ek)) continue;
    const loop: number[] = [startA, startB];
    used.add(ek);
    let prev = startA;
    let cur = startB;
    let guard = 0;
    while (guard < edges.length + 4) {
      guard += 1;
      if (cur === startA) break;
      const nbs = adj.get(cur) ?? [];
      let next = -1;
      for (const n of nbs) {
        if (n === prev) continue;
        const k = loopKey(cur, n);
        if (!used.has(k)) {
          next = n;
          break;
        }
      }
      if (next < 0) break;
      used.add(loopKey(cur, next));
      loop.push(next);
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3 && cur === startA) {
      if (loop[loop.length - 1] === startA) loop.pop();
      const pts = loop.map((i) => points[i]);
      if (polygonArea(pts) > 1e-8) loops.push(pts);
    }
  }
  return loops.sort((a, b) => polygonArea(b) - polygonArea(a));
}

export function rotateAroundAxis(point: Vec3, axisPoint: Vec3, axisDir: Vec3, angle: number): Vec3 {
  const k = norm(axisDir);
  const p = sub(point, axisPoint);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const term1 = mul(p, cosA);
  const term2 = mul(cross(k, p), sinA);
  const term3 = mul(k, dot(k, p) * (1 - cosA));
  return add(axisPoint, add(add(term1, term2), term3));
}

export function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return norm(cross(sub(b, a), sub(c, a)));
}

export function round(v: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 1e-9) return '0';
  const r = round(v, digits);
  return String(r);
}

export function fmtVec(v: Vec3, digits = 2): string {
  return `(${fmt(v[0], digits)}, ${fmt(v[1], digits)}, ${fmt(v[2], digits)})`;
}

export function bounds(points: Vec3[]): { min: Vec3; max: Vec3; center: Vec3; size: number } {
  if (!points.length) {
    return { min: v3(-1, -1, -1), max: v3(1, 1, 1), center: v3(), size: 2 };
  }
  const min: Vec3 = [...points[0]];
  const max: Vec3 = [...points[0]];
  for (const p of points) {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  const center = mul(add(min, max), 0.5);
  const size = Math.max(1, len(sub(max, min)));
  return { min, max, center, size };
}

export function makeCirclePoints(
  center: Vec3,
  normal: Vec3,
  radius: number,
  startAngle = 0,
  sweep = Math.PI * 2,
  segments = 96,
): Vec3[] {
  const n = norm(normal);
  const [u, v] = planeBasis(n);
  const count = Math.max(8, Math.round((Math.abs(sweep) / (Math.PI * 2)) * segments));
  const closed = Math.abs(Math.abs(sweep) - Math.PI * 2) < 1e-6;
  const total = closed ? count : count + 1;
  const pts: Vec3[] = [];
  for (let i = 0; i < total; i += 1) {
    const t = startAngle + (sweep * i) / count;
    pts.push(
      add(
        center,
        add(mul(u, Math.cos(t) * radius), mul(v, Math.sin(t) * radius)),
      ),
    );
  }
  return pts;
}

export function directionCosines(v: Vec3): Vec3 {
  const l = len(v);
  return l < EPS ? [0, 0, 0] : [v[0] / l, v[1] / l, v[2] / l];
}

export function projectionVector(a: Vec3, onto: Vec3): Vec3 {
  const d = len2(onto);
  return d < EPS ? [0, 0, 0] : mul(onto, dot(a, onto) / d);
}

export function perpendicularVector(a: Vec3, onto: Vec3): Vec3 {
  return sub(a, projectionVector(a, onto));
}

/** Ramer–Douglas–Peucker simplification for trails in 3D. */
export function simplifyTrail(points: Vec3[], tolerance = 0.015): Vec3[] {
  if (points.length < 3) return points;
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxD = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = len2(cross(sub(points[i], points[first]), sub(points[last], points[first]))) /
        Math.max(1e-9, dist2(points[first], points[last]));
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index >= 0 && maxD > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
