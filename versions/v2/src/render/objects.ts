import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type {
  CircleEntity,
  Entity,
  LineEntity,
  PlaneEntity,
  PointEntity,
  SectionEntity,
  SegmentEntity,
  SolidEntity,
  TrailEntity,
  Vec3,
  VectorEntity,
  ViewportId,
} from '../core/types';
import {
  add,
  cross,
  dist,
  dot,
  fmt,
  len,
  makeCirclePoints,
  mul,
  norm,
  polygonArea,
  polygonCentroid,
  polygonNormal,
  sub,
  triangulateFace,
} from '../core/math';
import {
  resolveAnchor,
  resolveCircle,
  resolvePlane,
  resolveSegment,
  resolveVector,
  sectionPolygons,
  solidMetrics,
  solidTriangles,
} from '../core/entities';
import { LabelSprite } from './labels';

export const ACCENT = '#38bdf8';
export const SELECT = '#fbbf24';
export const HOVER = '#a5f3fc';

export interface StyleContext {
  theme: 'dark' | 'light';
  selected: boolean;
  hovered: boolean;
  selectedParts: Set<string>;
  hoveredParts: Set<string>;
  viewport: ViewportId;
  wireframe: boolean;
}

export interface EntityObject {
  id: string;
  entity: Entity;
  group: THREE.Group;
  update: (entity: Entity, theme: 'dark' | 'light') => void;
  applyStyle: (ctx: StyleContext) => void;
  setLabelsVisible: (visible: boolean) => void;
  dispose: () => void;
}

let haloTexture: THREE.CanvasTexture | null = null;
function getHaloTexture(): THREE.CanvasTexture {
  if (haloTexture) return haloTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,.9)');
  grad.addColorStop(0.25, 'rgba(125,211,252,.42)');
  grad.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  haloTexture = new THREE.CanvasTexture(canvas);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

function labelColor(theme: 'dark' | 'light', accent = false) {
  return {
    theme,
    accent: accent ? SELECT : undefined,
    small: true,
  };
}

function disposeMaterial(mat: THREE.Material | THREE.Material[]) {
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
}

export class PointObject implements EntityObject {
  id: string;
  entity: Entity;
  group = new THREE.Group();
  private mesh: THREE.Mesh;
  private halo: THREE.Sprite;
  private material: THREE.MeshStandardMaterial;
  private label: LabelSprite;
  private baseColor = '#f8fafc';

  constructor(entity: PointEntity, theme: 'dark' | 'light') {
    this.id = entity.id;
    this.entity = entity;
    this.baseColor = theme === 'dark' ? '#f8fafc' : '#0f172a';
    const geo = new THREE.SphereGeometry(0.075, 18, 14);
    this.material = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      emissive: new THREE.Color('#93c5fd'),
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.userData = { pickRef: { id: entity.id }, kind: 'point' };
    this.mesh.renderOrder = 4;
    this.group.add(this.mesh);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getHaloTexture(),
        transparent: true,
        depthWrite: false,
        depthTest: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.halo.scale.set(0.38, 0.38, 1);
    this.halo.raycast = () => {};
    this.group.add(this.halo);
    this.label = new LabelSprite(entity.name, labelColor(theme));
    this.group.add(this.label.sprite);
    this.update(entity, theme);
  }

  update(entity: Entity, theme: 'dark' | 'light') {
    if (entity.type !== 'point') return;
    this.entity = entity;
    this.baseColor = theme === 'dark' ? '#f8fafc' : '#0f172a';
    this.material.color.set(this.baseColor);
    this.group.position.set(entity.pos[0], entity.pos[1], entity.pos[2]);
    this.label.setText(entity.name, labelColor(theme));
    this.label.setPosition([0.10, 0.10, 0.12]);
  }

  applyStyle(ctx: StyleContext) {
    const selected = ctx.selected;
    const hovered = ctx.hovered;
    this.material.color.set(selected ? SELECT : hovered ? HOVER : this.baseColor);
    this.material.emissive.set(selected ? '#f59e0b' : '#93c5fd');
    this.material.emissiveIntensity = selected ? 1.0 : hovered ? 0.8 : 0.45;
    this.mesh.scale.setScalar(selected ? 1.35 : hovered ? 1.18 : 1);
    (this.halo.material as THREE.SpriteMaterial).opacity = selected ? 0.8 : hovered ? 0.68 : 0.42;
    this.label.setText(this.entity.name, {
      ...labelColor(ctx.theme, selected || hovered),
      muted: false,
    });
    this.halo.visible = true;
  }

  setLabelsVisible(visible: boolean) {
    this.label.sprite.visible = visible;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
        (obj as THREE.Mesh).geometry?.dispose?.();
        const mat = (obj as THREE.Mesh).material;
        if (mat && !(obj instanceof THREE.Sprite)) disposeMaterial(mat as THREE.Material);
      }
    });
    this.material.dispose();
  }
}

function orientCylinder(mesh: THREE.Mesh, a: Vec3, b: Vec3) {
  const dir = sub(b, a);
  const l = len(dir);
  if (l < 1e-8) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  mesh.quaternion.setFromUnitVectors(up, d);
  mesh.scale.set(1, l, 1);
}

export class SegmentObject implements EntityObject {
  id: string;
  entity: Entity;
  group = new THREE.Group();
  private mesh: THREE.Mesh;
  private capA: THREE.Mesh;
  private capB: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private capMaterial: THREE.MeshBasicMaterial;
  private cylinderGeo: THREE.CylinderGeometry;
  private capGeo: THREE.SphereGeometry;
  private infinite: boolean;
  private label: LabelSprite | null = null;
  private start: Vec3 = [0, 0, 0];
  private end: Vec3 = [0, 0, 0];

  constructor(entity: SegmentEntity | LineEntity, theme: 'dark' | 'light') {
    this.id = entity.id;
    this.entity = entity;
    this.infinite = entity.type === 'line';
    this.cylinderGeo = new THREE.CylinderGeometry(this.infinite ? 0.012 : 0.018, this.infinite ? 0.012 : 0.018, 1, 10);
    this.capGeo = new THREE.SphereGeometry(this.infinite ? 0.025 : 0.038, 12, 10);
    this.material = new THREE.MeshStandardMaterial({
      color: entity.color,
      emissive: new THREE.Color(entity.color),
      emissiveIntensity: this.infinite ? 0.45 : 0.3,
      roughness: 0.35,
      metalness: 0.05,
    });
    this.capMaterial = new THREE.MeshBasicMaterial({ color: entity.color });
    this.mesh = new THREE.Mesh(this.cylinderGeo, this.material);
    this.mesh.userData = { pickRef: { id: entity.id } };
    this.capA = new THREE.Mesh(this.capGeo, this.capMaterial);
    this.capB = new THREE.Mesh(this.capGeo, this.capMaterial);
    this.capA.userData = this.mesh.userData;
    this.capB.userData = this.mesh.userData;
    this.capA.visible = false;
    this.capB.visible = false;
    this.group.add(this.mesh, this.capA, this.capB);
    this.label = null;
    this.update(entity, theme);
  }

  update(entity: Entity, theme: 'dark' | 'light') {
    if (entity.type !== 'segment' && entity.type !== 'line') return;
    this.entity = entity;
    const seg = resolveSegment(entity, []);
    void seg;
    // Resolve against the global scene through a lazy import to avoid a store cycle.
    const all = getEntities();
    const resolved = resolveSegment(entity, all);
    if (!resolved) {
      this.group.visible = false;
      return;
    }
    this.group.visible = entity.visible;
    this.start = resolved.a;
    this.end = resolved.b;
    this.material.color.set(entity.color);
    this.material.emissive.set(entity.color);
    this.capMaterial.color.set(entity.color);
    if (this.infinite) {
      const d = norm(sub(resolved.b, resolved.a));
      const extend = 32;
      const a = sub(resolved.a, mul(d, extend)) as Vec3;
      const b = add(resolved.b, mul(d, extend)) as Vec3;
      orientCylinder(this.mesh, a, b);
      this.capA.visible = false;
      this.capB.visible = false;
      if (!this.label) {
        this.label = new LabelSprite(entity.name, { ...labelColor(theme), muted: true, small: true });
        this.group.add(this.label.sprite);
      }
      this.label.setText(entity.name, { ...labelColor(theme), muted: true, small: true });
      const mid = mul(add(resolved.a, resolved.b), 0.5);
      this.label.setPosition([mid[0] + 0.1, mid[1] + 0.1, mid[2] + 0.12]);
    } else {
      orientCylinder(this.mesh, resolved.a, resolved.b);
      this.capA.visible = true;
      this.capB.visible = true;
      this.capA.position.set(...resolved.a);
      this.capB.position.set(...resolved.b);
    }
    const aVec = new THREE.Vector3(...resolved.a);
    const bVec = new THREE.Vector3(...resolved.b);
    this.mesh.userData = { pickRef: { id: entity.id } };
    void aVec;
    void bVec;
  }

  applyStyle(ctx: StyleContext) {
    const selected = ctx.selected;
    const hovered = ctx.hovered;
    this.material.color.set(selected ? SELECT : hovered ? HOVER : this.entity.color);
    this.material.emissive.set(selected ? '#b45309' : this.entity.color);
    this.material.emissiveIntensity = selected ? 0.9 : hovered ? 0.65 : this.infinite ? 0.45 : 0.3;
    this.capMaterial.color.set(selected ? SELECT : hovered ? HOVER : this.entity.color);
    this.mesh.scale.x = selected ? 1.6 : 1;
    this.mesh.scale.z = selected ? 1.6 : 1;
  }

  setLabelsVisible(visible: boolean) {
    if (this.label) this.label.sprite.visible = visible;
  }

  dispose() {
    this.cylinderGeo.dispose();
    this.capGeo.dispose();
    this.material.dispose();
    this.capMaterial.dispose();
    if (this.label) this.label.sprite.material.dispose();
  }
}

let entityProvider: (() => Entity[]) | null = null;
export function setEntityProvider(provider: () => Entity[]) {
  entityProvider = provider;
}
function getEntities(): Entity[] {
  return entityProvider ? entityProvider() : [];
}

export class PlaneObject implements EntityObject {
  id: string;
  entity: Entity;
  group = new THREE.Group();
  private mesh: THREE.Mesh;
  private border: THREE.Line;
  private material: THREE.MeshBasicMaterial;
  private borderMat: THREE.LineBasicMaterial;
  private label: LabelSprite;
  private size = 5;
  private center: Vec3 = [0, 0, 0];
  private normal: Vec3 = [0, 0, 1];

  constructor(entity: PlaneEntity, theme: 'dark' | 'light') {
    this.id = entity.id;
    this.entity = entity;
    this.material = new THREE.MeshBasicMaterial({
      color: entity.color,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    });
    this.borderMat = new THREE.LineBasicMaterial({
      color: entity.color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.userData = { pickRef: { id: entity.id } };
    this.border = new THREE.Line(new THREE.BufferGeometry(), this.borderMat);
    this.border.raycast = () => {};
    this.group.add(this.mesh, this.border);
    this.label = new LabelSprite(entity.name, { ...labelColor(theme), muted: true, small: true });
    this.group.add(this.label.sprite);
    this.update(entity, theme);
  }

  update(entity: Entity, theme: 'dark' | 'light') {
    if (entity.type !== 'plane') return;
    this.entity = entity;
    const all = getEntities();
    const plane = resolvePlane(entity.definition, all);
    if (!plane) {
      this.group.visible = false;
      return;
    }
    this.group.visible = entity.visible;
    let center = plane.point;
    let size = entity.size;
    if (entity.definition.kind === 'points') {
      const a = resolveAnchor(entity.definition.a, all);
      const b = resolveAnchor(entity.definition.b, all);
      const c = resolveAnchor(entity.definition.c, all);
      if (a && b && c) {
        center = mul(add(add(a.pos, b.pos), c.pos), 1 / 3);
        size = Math.max(entity.size * 0.7, Math.max(dist(a.pos, b.pos), dist(b.pos, c.pos), dist(c.pos, a.pos)) * 1.8);
      }
    }
    this.center = center;
    this.normal = plane.normal;
    this.size = Math.max(2, size);
    this.mesh.position.set(...center);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...plane.normal));
    this.mesh.scale.set(this.size, this.size, 1);
    this.mesh.userData = { pickRef: { id: entity.id } };
    this.material.color.set(entity.color);
    this.material.opacity = 0.085;
    this.borderMat.color.set(entity.color);
    const [u, v] = planeBasisVec(plane.normal);
    const half = this.size / 2;
    const corners = [
      add(center, add(mul(u, -half), mul(v, -half))),
      add(center, add(mul(u, half), mul(v, -half))),
      add(center, add(mul(u, half), mul(v, half))),
      add(center, add(mul(u, -half), mul(v, half))),
      add(center, add(mul(u, -half), mul(v, -half))),
    ];
    this.border.geometry.dispose();
    this.border.geometry = new THREE.BufferGeometry().setFromPoints(corners.map((p) => new THREE.Vector3(...p)));
    this.label.setText(entity.name, { ...labelColor(theme), muted: true, small: true });
    const labelPos = add(center, add(mul(u, half * 0.78), add(mul(v, half * 0.78), [0, 0, 0.05])));
    this.label.setPosition(labelPos);
  }

  applyStyle(ctx: StyleContext) {
    const selected = ctx.selected;
    const hovered = ctx.hovered;
    this.material.color.set(selected ? SELECT : hovered ? HOVER : (this.entity as PlaneEntity).color);
    this.material.opacity = selected ? 0.18 : hovered ? 0.14 : 0.085;
    this.borderMat.color.set(selected ? SELECT : hovered ? HOVER : (this.entity as PlaneEntity).color);
    this.borderMat.opacity = selected ? 0.95 : 0.55;
  }

  setLabelsVisible(visible: boolean) {
    this.label.sprite.visible = visible;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.border.geometry.dispose();
    this.borderMat.dispose();
    this.label.sprite.material.dispose();
  }
}

function planeBasisVec(normal: Vec3): [Vec3, Vec3] {
  const n = norm(normal);
  const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = norm(cross(helper, n));
  const v = norm(cross(n, u));
  return [u, v];
}

export class CircleObject implements EntityObject {
  id: string;
  entity: Entity;
  group = new THREE.Group();
  private mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private label: LabelSprite;
  private points: Vec3[] = [];

  constructor(entity: CircleEntity, theme: 'dark' | 'light') {
    this.id = entity.id;
    this.entity = entity;
    this.material = new THREE.MeshStandardMaterial({
      color: entity.color,
      emissive: new THREE.Color(entity.color),
      emissiveIntensity: 0.5,
      roughness: 0.35,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.userData = { pickRef: { id: entity.id } };
    this.group.add(this.mesh);
    this.label = new LabelSprite(entity.name, { ...labelColor(theme), muted: true, small: true });
    this.group.add(this.label.sprite);
    this.update(entity, theme);
  }

  update(entity: Entity, theme: 'dark' | 'light') {
    if (entity.type !== 'circle') return;
    this.entity = entity;
    const all = getEntities();
    const circle = resolveCircle(entity, all);
    if (!circle || circle.radius < 1e-5) {
      this.group.visible = false;
      return;
    }
    this.group.visible = entity.visible;
    this.material.color.set(entity.color);
    this.material.emissive.set(entity.color);
    const pts = makeCirclePoints(
      circle.center,
      circle.normal,
      circle.radius,
      circle.startAngle,
      circle.sweep,
      120,
    );
    this.points = pts;
    const closed = Math.abs(Math.abs(circle.sweep) - Math.PI * 2) < 1e-5;
    const curve = new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(...p)),
      closed,
      'centripetal',
      0.5,
    );
    const geo = new THREE.TubeGeometry(curve, Math.max(24, pts.length * 2), 0.016, 6, closed);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    const mid = pts[Math.floor(pts.length / 2)] ?? circle.center;
    this.label.setText(
      closed ? entity.name : `${entity.name} ${fmt((Math.abs(circle.sweep) * 180) / Math.PI, 1)}°`,
      { ...labelColor(theme), muted: true, small: true },
    );
    this.label.setPosition([mid[0] + 0.12, mid[1] + 0.12, mid[2] + 0.14]);
  }

  applyStyle(ctx: StyleContext) {
    const selected = ctx.selected;
    const hovered = ctx.hovered;
    this.material.color.set(selected ? SELECT : hovered ? HOVER : (this.entity as CircleEntity).color);
    this.material.emissive.set(selected ? '#b45309' : (this.entity as CircleEntity).color);
    this.material.emissiveIntensity = selected ? 1.0 : hovered ? 0.8 : 0.5;
  }

  setLabelsVisible(visible: boolean) {
    this.label.sprite.visible = visible;
  }

  getPoints() {
    return this.points;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.label.sprite.material.dispose();
  }
}

export class VectorObject implements EntityObject {
  id: string;
  entity: Entity;
  group = new THREE.Group();
  private shaft: THREE.Mesh;
  private head: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private label: LabelSprite;
  private shaftGeo = new THREE.CylinderGeometry(0.027, 0.027, 1, 10);
  private headGeo = new THREE.ConeGeometry(0.085, 0.26, 14);

  constructor(entity: VectorEntity, theme: 'dark' | 'light') {
    this.id = entity.id;
    this.entity = entity;
    this.material = new THREE.MeshStandardMaterial({
      color: entity.color,
      emissive: new THREE.Color(entity.color),
      emissiveIntensity: 0.42,
      roughness: 0.3,
      metalness: 0.08,
    });
    this.shaft = new THREE.Mesh(this.shaftGeo, this.material);
    this.head = new THREE.Mesh(this.headGeo, this.material);
    this.shaft.userData = { pickRef: { id: entity.id } };
    this.head.userData = { pickRef: { id: entity.id } };
    this.group.add(this.shaft, this.head);
    this.label = new LabelSprite(entity.name, { ...labelColor(theme), muted: true, small: true });
    this.group.add(this.label.sprite);
    this.update(entity, theme);
  }

  update(entity: Entity, theme: 'dark' | 'light') {
    if (entity.type !== 'vector') return;
    this.entity = entity;
    const all = getEntities();
    const v = resolveVector(entity, all);
    if (!v || v.magnitude < 1e-6) {
      this.group.visible = false;
      return;
    }
    this.group.visible = entity.visible;
    this.material.color.set(entity.color);
    this.material.emissive.set(entity.color);
    const dir = norm(v.value);
    const origin = new THREE.Vector3(...v.origin);
    const d = new THREE.Vector3(...dir);
    const length = v.magnitude;
    const headLength = Math.min(0.26, length * 0.28);
    const shaftLength = Math.max(0.01, length - headLength);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, d);
    this.shaft.position.copy(origin).add(d.clone().multiplyScalar(shaftLength / 2));
    this.shaft.quaternion.copy(q);
    this.shaft.scale.set(1, shaftLength, 1);
    this.head.position.copy(origin).add(d.clone().multiplyScalar(length - headLength / 2));
    this.head.quaternion.copy(q);
    this.head.scale.set(1, headLength / 0.26, 1);
    const tip = add(v.origin, v.value);
    this.label.setText(entity.name, {
      ...labelColor(theme),
      muted: true,
      small: true,
    });
    this.label.setPosition([tip[0] + 0.12, tip[1] + 0.12, tip[2] + 0.12]);
  }

  applyStyle(ctx: StyleContext) {
    const selected = ctx.selected;
    const hovered = ctx.hovered;
    this.material.color.set(selected ? SELECT : hovered ? HOVER : (this.entity as VectorEntity).color);
    this.material.emissive.set(selected ? '#b45309' : (this.entity as VectorEntity).color);
    this.material.emissiveIntensity = selected ? 1.0 : hovered ? 0.75 : 0.42;
  }

  setLabelsVisible(visible: boolean) {
    this.label.sprite.visible = visible;
  }

  dispose() {
    this.shaftGeo.dispose();
    this.headGeo.dispose();
    this.material.dispose();
    this.label.sprite.material.dispose();
  }
}

export class SectionObject implements EntityObject {
  id: string;
  entity: Entity;
  group = new THREE.Group();
  private label: LabelSprite;
  private material: THREE.MeshBasicMaterial;
  private lineMat: THREE.LineBasicMaterial;
  private area = 0;

  constructor(entity: SectionEntity, theme: 'dark' | 'light') {
    this.id = entity.id;
    this.entity = entity;
    this.material = new THREE.MeshBasicMaterial({
      color: entity.color,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    this.lineMat = new THREE.LineBasicMaterial({
      color: entity.color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.label = new LabelSprite(entity.name, { ...labelColor(theme), small: true });
    this.group.add(this.label.sprite);
    this.update(entity, theme);
  }

  update(entity: Entity, theme: 'dark' | 'light') {
    if (entity.type !== 'section') return;
    this.entity = entity;
    const all = getEntities();
    const polygons = sectionPolygons(entity, all);
    for (const child of [...this.group.children]) {
      if (child === this.label.sprite) continue;
      this.group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
      }
    }
    this.area = 0;
    let biggest: { points: Vec3[]; area: number } | null = null;
    for (const poly of polygons) {
      this.area += poly.area;
      if (!biggest || poly.area > biggest.area) biggest = { points: poly.points, area: poly.area };
      if (entity.fill) {
        const positions: number[] = [];
        for (let i = 1; i < poly.points.length - 1; i += 1) {
          positions.push(...poly.points[0], ...poly.points[i], ...poly.points[i + 1]);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.userData = { pickRef: { id: entity.id } };
        mesh.renderOrder = 7;
        this.group.add(mesh);
      }
      const loop = [...poly.points, poly.points[0]];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(loop.map((p) => new THREE.Vector3(...p)));
      const line = new THREE.Line(lineGeo, this.lineMat);
      line.raycast = () => {};
      this.group.add(line);
    }
    if (biggest) {
      const c = polygonCentroid(biggest.points);
      this.label.setText(`S=${fmt(this.area, 2)}`, { ...labelColor(theme), small: true });
      this.label.setPosition([c[0] + 0.10, c[1] + 0.10, c[2] + 0.18]);
    } else {
      this.group.visible = false;
    }
    this.group.visible = entity.visible && polygons.length > 0;
  }

  applyStyle(ctx: StyleContext) {
    const selected = ctx.selected;
    const hovered = ctx.hovered;
    const color = selected ? SELECT : hovered ? HOVER : (this.entity as SectionEntity).color;
    this.material.color.set(color);
    this.lineMat.color.set(color);
    this.material.opacity = selected ? 0.34 : hovered ? 0.28 : 0.22;
  }

  setLabelsVisible(visible: boolean) {
    this.label.sprite.visible = visible;
  }

  getArea() {
    return this.area;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) obj.geometry?.dispose?.();
    });
    this.material.dispose();
    this.lineMat.dispose();
    this.label.sprite.material.dispose();
  }
}

export class TrailObject implements EntityObject {
  id: string;
  entity: Entity;
  group = new THREE.Group();
  private mesh: THREE.Line;
  private material: THREE.LineBasicMaterial;

  constructor(entity: TrailEntity, theme: 'dark' | 'light') {
    this.id = entity.id;
    this.entity = entity;
    this.material = new THREE.LineBasicMaterial({
      color: entity.color,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.mesh = new THREE.Line(new THREE.BufferGeometry(), this.material);
    this.mesh.raycast = () => {};
    this.group.add(this.mesh);
    this.update(entity, theme);
  }

  update(entity: Entity, theme: 'dark' | 'light') {
    if (entity.type !== 'trail') return;
    this.entity = entity;
    const pts = entity.points.map((p) => new THREE.Vector3(...p));
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.group.visible = entity.visible && pts.length > 1;
    this.material.color.set(entity.color);
  }

  applyStyle() {
    /* trail styling is fixed */
  }

  setLabelsVisible() {
    /* no labels */
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export interface EdgeGroup {
  visible: LineSegments2;
  hidden: THREE.LineSegments;
  visibleMat: LineMaterial;
  hiddenMat: THREE.LineDashedMaterial;
  cacheKey: string;
  hasVisible: boolean;
  hasHidden: boolean;
}

const ALL_VIEWS: ViewportId[] = ['perspective', 'front', 'top', 'left'];

export class SolidObject implements EntityObject {
  id: string;
  entity: Entity;
  group = new THREE.Group();
  mesh: THREE.Mesh;
  meshMaterial: THREE.MeshPhysicalMaterial;
  edgeGroups = new Map<ViewportId, EdgeGroup>();
  handles: Array<{ mesh: THREE.Mesh; index: number; material: THREE.MeshBasicMaterial }> = [];
  labels: Array<{ label: LabelSprite; index: number }> = [];
  faceMap: number[] = [];
  private handleGeo = new THREE.SphereGeometry(0.052, 14, 10);
  private meshesForPick: THREE.Object3D[] = [];
  private clippingPlanes: THREE.Plane[] = [];

  constructor(entity: SolidEntity, theme: 'dark' | 'light') {
    this.id = entity.id;
    this.entity = entity;
    this.meshMaterial = new THREE.MeshPhysicalMaterial({
      color: entity.color,
      transparent: true,
      opacity: entity.opacity,
      roughness: 0.32,
      metalness: 0.05,
      clearcoat: 0.35,
      clearcoatRoughness: 0.5,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.meshMaterial);
    this.mesh.renderOrder = 1;
    this.group.add(this.mesh);
    this.createEdgeGroups(theme);
    this.update(entity, theme);
  }

  private createEdgeGroups(theme: 'dark' | 'light') {
    for (const view of ALL_VIEWS) {
      const visibleMat = new LineMaterial({
        color: theme === 'dark' ? '#dbeafe' : '#1e293b',
        linewidth: 1.55,
        transparent: true,
        opacity: 0.86,
        dashed: false,
        depthTest: true,
      });
      visibleMat.resolution.set(800, 600);
      const visible = new LineSegments2(new LineSegmentsGeometry(), visibleMat);
      visible.visible = false;
      visible.renderOrder = 3;
      const hiddenMat = new THREE.LineDashedMaterial({
        color: theme === 'dark' ? '#94a3b8' : '#64748b',
        dashSize: 0.11,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
        depthWrite: false,
      });
      const hidden = new THREE.LineSegments(new THREE.BufferGeometry(), hiddenMat);
      hidden.visible = false;
      hidden.renderOrder = 9;
      this.group.add(visible, hidden);
      this.edgeGroups.set(view, {
        visible,
        hidden,
        visibleMat,
        hiddenMat,
        cacheKey: '',
        hasVisible: false,
        hasHidden: false,
      });
    }
  }

  update(entity: Entity, theme: 'dark' | 'light') {
    if (entity.type !== 'solid') return;
    this.entity = entity;
    this.group.visible = entity.visible;
    this.meshMaterial.color.set(entity.color);
    this.meshMaterial.opacity = entity.opacity;
    const tris = solidTriangles(entity);
    const positions: number[] = [];
    const normals: number[] = [];
    this.faceMap = [];
    const center = solidMetrics(entity).centroid;
    for (const [a, b, c, faceIndex] of tris) {
      const va = entity.vertices[a];
      const vb = entity.vertices[b];
      const vc = entity.vertices[c];
      positions.push(...va, ...vb, ...vc);
      this.faceMap.push(faceIndex);
      if (entity.solidType === 'sphere') {
        for (const p of [va, vb, vc]) {
          const n = norm(sub(p, center));
          normals.push(...n);
        }
      } else {
        const n = norm(cross(sub(vb, va), sub(vc, va)));
        normals.push(...n, ...n, ...n);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.computeBoundingSphere();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.mesh.userData = { solidId: entity.id, faceMap: this.faceMap };
    this.meshesForPick = [this.mesh];
    this.rebuildLabelsAndHandles(theme);
    this.invalidateEdges();
  }

  private rebuildLabelsAndHandles(theme: 'dark' | 'light') {
    const entity = this.entity as SolidEntity;
    const smooth = entity.solidType === 'sphere';
    const labelsWanted = new Set(entity.labelIndices ?? entity.vertices.map((_, i) => i));
    const existingLabels = new Map(this.labels.map((l) => [l.index, l]));
    const nextLabels: Array<{ label: LabelSprite; index: number }> = [];
    for (const index of labelsWanted) {
      let entry = existingLabels.get(index);
      if (!entry) {
        const label = new LabelSprite(entity.vertexNames[index] || `${index + 1}`, {
          ...labelColor(theme),
          small: false,
        });
        this.group.add(label.sprite);
        entry = { label, index };
      }
      const v = entity.vertices[index];
      if (!v) continue;
      entry.label.setText(entity.vertexNames[index] || `${index + 1}`, {
        ...labelColor(theme),
        small: true,
      });
      entry.label.setPosition([v[0] + 0.11, v[1] + 0.11, v[2] + 0.14]);
      nextLabels.push(entry);
    }
    for (const entry of this.labels) {
      if (!labelsWanted.has(entry.index)) {
        this.group.remove(entry.label.sprite);
        entry.label.sprite.material.dispose();
      }
    }
    this.labels = nextLabels;

    const polyhedral = ['cube', 'cuboid', 'prism', 'pyramid', 'tetra', 'extrude'].includes(entity.solidType);
    const handleIndices = polyhedral ? entity.vertices.map((_, i) => i) : [];
    const existingHandles = new Map(this.handles.map((h) => [h.index, h]));
    const nextHandles: typeof this.handles = [];
    for (const index of handleIndices) {
      let entry = existingHandles.get(index);
      if (!entry) {
        const material = new THREE.MeshBasicMaterial({
          color: theme === 'dark' ? '#f8fafc' : '#0f172a',
          transparent: true,
          opacity: 0.86,
          depthTest: true,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(this.handleGeo, material);
        mesh.renderOrder = 5;
        mesh.userData = {
          pickRef: { id: entity.id, part: { kind: 'vertex', index } },
          handle: true,
        };
        this.group.add(mesh);
        entry = { mesh, index, material };
      }
      const v = entity.vertices[index];
      if (!v) continue;
      entry.mesh.position.set(...v);
      entry.mesh.visible = true;
      nextHandles.push(entry);
    }
    for (const entry of this.handles) {
      if (!nextHandles.includes(entry)) {
        this.group.remove(entry.mesh);
        entry.material.dispose();
      }
    }
    this.handles = nextHandles;
    void smooth;
  }

  invalidateEdges(view?: ViewportId) {
    if (view) {
      const group = this.edgeGroups.get(view);
      if (group) group.cacheKey = '';
    } else {
      this.edgeGroups.forEach((group) => {
        group.cacheKey = '';
      });
    }
  }

  applyStyle(ctx: StyleContext) {
    const selected = ctx.selected;
    const hovered = ctx.hovered;
    const entity = this.entity as SolidEntity;
    const baseOpacity = entity.opacity;
    this.meshMaterial.wireframe = ctx.wireframe;
    this.meshMaterial.opacity = ctx.wireframe
      ? 0.10
      : selected
        ? Math.max(baseOpacity, 0.3)
        : hovered
          ? Math.max(baseOpacity, 0.23)
          : baseOpacity;
    this.meshMaterial.emissive.set(selected ? '#b45309' : hovered ? '#0e7490' : '#000000');
    this.meshMaterial.emissiveIntensity = selected ? 0.55 : hovered ? 0.3 : 0;
    const baseEdge = ctx.theme === 'dark' ? '#dbeafe' : '#1e293b';
    const hiddenEdge = ctx.theme === 'dark' ? '#94a3b8' : '#64748b';
    for (const [, group] of this.edgeGroups) {
      group.visibleMat.color.set(selected ? SELECT : hovered ? HOVER : baseEdge);
      group.visibleMat.linewidth = selected ? 2.4 : hovered ? 2.0 : 1.55;
      group.visibleMat.opacity = selected ? 1 : hovered ? 0.98 : 0.86;
      group.hiddenMat.color.set(selected ? '#f59e0b' : hovered ? HOVER : hiddenEdge);
      group.hiddenMat.opacity = selected ? 0.75 : 0.55;
    }
    for (const handle of this.handles) {
      const partSelected = ctx.selectedParts.has(`${this.id}:vertex:${handle.index}`);
      const partHovered = ctx.hoveredParts.has(`${this.id}:vertex:${handle.index}`);
      handle.material.color.set(partSelected ? SELECT : partHovered ? HOVER : ctx.theme === 'dark' ? '#f8fafc' : '#0f172a');
      handle.mesh.scale.setScalar(partSelected ? 1.55 : partHovered ? 1.25 : 1);
    }
    for (const entry of this.labels) {
      const partSelected = ctx.selectedParts.has(`${this.id}:vertex:${entry.index}`);
      const partHovered = ctx.hoveredParts.has(`${this.id}:vertex:${entry.index}`);
      entry.label.setText((entity.vertexNames[entry.index] || `${entry.index + 1}`), {
        theme: ctx.theme,
        accent: partSelected || selected ? SELECT : partHovered ? HOVER : undefined,
        small: true,
      });
    }
  }

  setLabelsVisible(visible: boolean) {
    this.labels.forEach((l) => {
      l.label.sprite.visible = visible;
    });
  }

  setClipping(planes: THREE.Plane[]) {
    const changed = planes.length !== this.clippingPlanes.length ||
      planes.some((p, i) => {
        const q = this.clippingPlanes[i];
        return !q || !p.normal.equals(q.normal) || p.constant !== q.constant;
      });
    if (!changed) return;
    this.clippingPlanes = planes;
    this.meshMaterial.clippingPlanes = planes;
    this.meshMaterial.clipShadows = true;
    this.meshMaterial.needsUpdate = true;
    for (const [, group] of this.edgeGroups) {
      group.visibleMat.clippingPlanes = planes;
      group.visibleMat.needsUpdate = true;
      group.hiddenMat.clippingPlanes = planes;
      group.hiddenMat.needsUpdate = true;
    }
  }

  setViewportResolution(view: ViewportId, width: number, height: number) {
    const group = this.edgeGroups.get(view);
    if (group) group.visibleMat.resolution.set(width, height);
  }

  setEdgeViewport(current: ViewportId) {
    for (const [view, group] of this.edgeGroups) {
      group.visible.visible = view === current && group.hasVisible;
      group.hidden.visible = view === current && group.hasHidden;
    }
  }

  setEdgeData(view: ViewportId, visible: number[], hidden: number[], key: string) {
    const group = this.edgeGroups.get(view);
    if (!group) return;
    if (group.cacheKey === key) return;
    group.cacheKey = key;
    if (visible.length >= 6) {
      group.visible.geometry.dispose();
      const geom = new LineSegmentsGeometry();
      geom.setPositions(visible);
      group.visible.geometry = geom;
      group.visible.computeLineDistances();
      group.hasVisible = true;
    } else {
      group.hasVisible = false;
    }
    if (hidden.length >= 6) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(hidden, 3));
      group.hidden.geometry.dispose();
      group.hidden.geometry = geom;
      group.hidden.computeLineDistances();
      group.hasHidden = true;
    } else {
      group.hasHidden = false;
    }
    group.visible.visible = false;
    group.hidden.visible = false;
  }

  get allEdgeGroups(): EdgeGroup[] {
    return [...this.edgeGroups.values()];
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.meshMaterial.dispose();
    this.handleGeo.dispose();
    for (const group of this.edgeGroups.values()) {
      group.visible.geometry.dispose();
      group.visibleMat.dispose();
      group.hidden.geometry.dispose();
      group.hiddenMat.dispose();
    }
    for (const handle of this.handles) handle.material.dispose();
    for (const entry of this.labels) entry.label.sprite.material.dispose();
  }
}

export function createEntityObject(entity: Entity, theme: 'dark' | 'light'): EntityObject {
  switch (entity.type) {
    case 'point':
      return new PointObject(entity, theme);
    case 'segment':
    case 'line':
      return new SegmentObject(entity, theme);
    case 'plane':
      return new PlaneObject(entity, theme);
    case 'circle':
      return new CircleObject(entity, theme);
    case 'vector':
      return new VectorObject(entity, theme);
    case 'section':
      return new SectionObject(entity, theme);
    case 'trail':
      return new TrailObject(entity, theme);
    case 'solid':
      return new SolidObject(entity, theme);
  }
}
