import * as THREE from 'three';
import type {
  CameraState,
  Entity,
  SelectionRef,
  SolidEntity,
  Vec3,
  ViewportId,
} from '../core/types';
import {
  acuteLineAngle,
  add,
  angleDeg,
  clamp,
  DEG,
  dist,
  dot,
  fmt,
  fmtVec,
  len,
  lineLineClosest,
  linePlaneIntersection,
  makeCirclePoints,
  mul,
  norm,
  planePlaneIntersection,
  pointLineDistance,
  pointPlaneDistance,
  polygonArea,
  polygonCentroid,
  sub,
  triangleArea,
} from '../core/math';
import {
  anchorForSelection,
  resolveAnchor,
  resolveCircle,
  resolvePlane,
  resolveSegment,
  sectionArea,
  sectionPolygons,
  solidMetrics,
} from '../core/entities';
import { resolveAll, selectionLabel } from '../core/analysis';
import { useApp } from '../store/useApp';
import { LabelSprite } from './labels';
import {
  ACCENT,
  createEntityObject,
  HOVER,
  SELECT,
  setEntityProvider,
  SolidObject,
  type EntityObject,
  type StyleContext,
} from './objects';
import {
  registerViewportController,
  type ViewportController,
} from './viewportController';
import {
  exportOBJ,
  exportSectionOBJ,
  exportSectionSVG,
  exportSVG,
  exportThreeViewSVG,
  type ExportEdgeData,
} from './exporters';

const ALL_VIEWS: ViewportId[] = ['perspective', 'front', 'top', 'left'];
const FOV = 45;
const ORTHO_BASE = 6.2;
const VIEW_AXIS: Record<'front' | 'top' | 'left', { pos: Vec3; up: Vec3; right: Vec3; grid: string }> = {
  top: { pos: [0, 0, 60], up: [0, 1, 0], right: [1, 0, 0], grid: 'xy' },
  front: { pos: [0, -60, 0], up: [0, 0, 1], right: [1, 0, 0], grid: 'xz' },
  left: { pos: [-60, 0, 0], up: [0, 0, 1], right: [0, 1, 0], grid: 'yz' },
};

interface ViewRuntime {
  id: ViewportId;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  persp?: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  target: THREE.Vector3;
  zoom: number;
  width: number;
  height: number;
  dirty: boolean;
  edgeDirty: boolean;
  lastEdgeCompute: number;
  edgeTimer: number | null;
  resizeObserver?: ResizeObserver;
}

interface DragState {
  mode: 'orbit' | 'pan' | 'vertex';
  view: ViewRuntime;
  button: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  anchor?: ReturnType<typeof anchorForSelection>;
  plane?: THREE.Plane;
  startPos?: THREE.Vector3;
  historyStarted?: boolean;
}

interface TraceAnimation {
  points: Vec3[];
  t: number;
  duration: number;
  marker: THREE.Mesh;
  trail: THREE.Line;
  trailPoints: Vec3[];
  pathKind: 'segment' | 'circle';
  pingPong: boolean;
}

interface RevolveAnimation {
  p0: Vec3;
  p1: Vec3;
  angle: number;
  duration: number;
  mesh: THREE.Mesh;
  ghost: THREE.Line;
  group: THREE.Group;
}

interface FadeAnimation {
  started: number;
  duration: number;
  entries: Array<{ material: THREE.Material; baseOpacity: number }>;
}

export interface ScreenPoint {
  x: number;
  y: number;
  z: number;
}

export class ViewportEngine implements ViewportController {
  private root: HTMLElement;
  public scene = new THREE.Scene();
  public entityRoot = new THREE.Group();
  private overlayRoot = new THREE.Group();
  private helperRoot = new THREE.Group();
  private animationRoot = new THREE.Group();
  private measurementRoot = new THREE.Group();
  private views = new Map<ViewportId, ViewRuntime>();
  private objects = new Map<string, EntityObject>();
  private selection = new Set<string>();
  private selectedParts = new Set<string>();
  private hovered = new Set<string>();
  private hoveredParts = new Set<string>();
  private wholeHoverId: string | null = null;
  private hoverRef: SelectionRef | null = null;
  private theme: 'dark' | 'light' = 'dark';
  private mainProjection: 'perspective' | 'orthographic' = 'perspective';
  private orbit = {
    target: new THREE.Vector3(0, 0, 1.15),
    yaw: -0.92,
    pitch: 0.42,
    distance: 12.5,
  };
  private drag: DragState | null = null;
  private raycaster = new THREE.Raycaster();
  private lastHoverCheck = 0;
  private lastMouseUpdate = 0;
  private lastAutoSave = 0;
  private lastFrame = performance.now();
  private animationId = 0;
  private disposed = false;
  private suppressCameraSync = false;
  private unsubscribe: (() => void) | null = null;
  private edgeEpoch = 0;
  private gridGroup = new THREE.Group();
  private grids = new Map<string, THREE.GridHelper>();
  private axisGroup = new THREE.Group();
  private axisLabels: LabelSprite[] = [];
  private helperLabels: LabelSprite[] = [];
  private faceHighlightRoot = new THREE.Group();
  private trace: TraceAnimation | null = null;
  private revolve: RevolveAnimation | null = null;
  private fade: FadeAnimation | null = null;
  private cursorTool = 'select';
  private resizeQueued = false;
  private lastCameraStoreSync = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.theme = useApp.getState().settings.theme;
    this.mainProjection = useApp.getState().camera.projection;
    this.scene.add(
      this.entityRoot,
      this.overlayRoot,
      this.helperRoot,
      this.animationRoot,
      this.faceHighlightRoot,
      this.measurementRoot,
    );
    setEntityProvider(() => useApp.getState().entities);
    this.setupLights();
    this.rebuildHelpers();
    this.setupViews();
    this.bindStore();
    this.syncEntities(useApp.getState().entities, true);
    this.applyStyles();
    this.rebuildMeasurements();
    this.applyClipping();
    this.resetViews(false);
    registerViewportController(this);
    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  private setupLights() {
    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 1.35);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(7, -8, 12);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.7);
    fill.position.set(-6, 7, 5);
    const rim = new THREE.DirectionalLight(0xf0abfc, 0.35);
    rim.position.set(2, 8, -6);
    this.scene.add(hemi, key, fill, rim);
  }

  private rebuildHelpers() {
    this.helperRoot.clear();
    this.helperRoot.add(this.gridGroup, this.axisGroup);
    this.gridGroup.clear();
    this.grids.clear();
    const dark = this.theme === 'dark';
    const c1 = dark ? '#58718f' : '#8fa4bc';
    const c2 = dark ? '#2b3c53' : '#c3d1e0';
    const makeGrid = (rotation: [number, number, number], key: string) => {
      const grid = new THREE.GridHelper(20, 20, c1, c2);
      grid.rotation.set(rotation[0], rotation[1], rotation[2]);
      grid.position.set(0, 0, 0);
      const material = grid.material as THREE.LineBasicMaterial;
      material.transparent = true;
      material.opacity = dark ? 0.55 : 0.6;
      material.depthWrite = false;
      grid.renderOrder = -2;
      grid.visible = false;
      this.gridGroup.add(grid);
      this.grids.set(key, grid);
    };
    makeGrid([Math.PI / 2, 0, 0], 'xy');
    makeGrid([0, 0, 0], 'xz');
    makeGrid([0, 0, Math.PI / 2], 'yz');

    this.axisGroup.clear();
    this.axisLabels = [];
    const axisLength = 4.6;
    const defs: Array<{ dir: Vec3; color: number; label: string }> = [
      { dir: [1, 0, 0], color: 0xf87171, label: 'X' },
      { dir: [0, 1, 0], color: 0x4ade80, label: 'Y' },
      { dir: [0, 0, 1], color: 0x60a5fa, label: 'Z' },
    ];
    const negativeMat = new THREE.LineBasicMaterial({
      color: dark ? 0x475569 : 0x94a3b8,
      transparent: true,
      opacity: 0.4,
    });
    for (const d of defs) {
      const dir = new THREE.Vector3(...d.dir);
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), axisLength, d.color, 0.22, 0.11);
      arrow.line.material = new THREE.LineBasicMaterial({ color: d.color, transparent: true, opacity: 0.9 });
      arrow.cone.material = new THREE.MeshBasicMaterial({ color: d.color });
      this.axisGroup.add(arrow);
      const negGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        dir.clone().multiplyScalar(-axisLength * 0.7),
      ]);
      const neg = new THREE.Line(negGeo, negativeMat);
      this.axisGroup.add(neg);
      const label = new LabelSprite(d.label, {
        theme: this.theme,
        accent: `#${d.color.toString(16).padStart(6, '0')}`,
        small: true,
        plain: true,
      });
      label.setPosition(dir.clone().multiplyScalar(axisLength + 0.35).toArray() as Vec3);
      this.axisGroup.add(label.sprite);
      this.axisLabels.push(label);
    }
    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 10),
      new THREE.MeshBasicMaterial({ color: dark ? 0xe2e8f0 : 0x0f172a }),
    );
    this.axisGroup.add(origin);
  }

  private setupViews() {
    for (const id of ALL_VIEWS) {
      const canvas = this.root.querySelector<HTMLCanvasElement>(`canvas[data-viewport="${id}"]`);
      if (!canvas) throw new Error(`Viewport canvas not found: ${id}`);
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.localClippingEnabled = true;
      const persp = id === 'perspective' ? new THREE.PerspectiveCamera(FOV, 1, 0.05, 400) : undefined;
      const ortho = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 400);
      if (id === 'perspective') {
        ortho.position.set(0, 0, 0);
      }
      const state = useApp.getState().camera;
      const target = new THREE.Vector3(...(id === 'perspective' ? state.target : state.orthoTarget));
      const view: ViewRuntime = {
        id,
        canvas,
        renderer,
        camera: id === 'perspective' ? persp! : ortho,
        persp,
        ortho,
        target,
        zoom: state.orthoZoom,
        width: 1,
        height: 1,
        dirty: true,
        edgeDirty: true,
        lastEdgeCompute: 0,
        edgeTimer: null,
      };
      this.views.set(id, view);
      canvas.addEventListener('pointerdown', (e) => this.onPointerDown(view, e));
      canvas.addEventListener('pointermove', (e) => this.onPointerMove(view, e));
      canvas.addEventListener('pointerup', (e) => this.onPointerUp(view, e));
      canvas.addEventListener('pointercancel', (e) => this.onPointerUp(view, e));
      canvas.addEventListener('wheel', (e) => this.onWheel(view, e), { passive: false });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerleave', () => {
        if (!this.drag) {
          this.hoverRef = null;
          this.wholeHoverId = null;
          this.applyStyles();
          useApp.getState().setHoverLabel(null);
          this.updateCursors();
        }
      });
      const ro = new ResizeObserver(() => this.resizeView(view));
      ro.observe(canvas);
      view.resizeObserver = ro;
      this.resizeView(view);
    }
    this.resetViewCameras();
  }

  private resizeView(view: ViewRuntime) {
    const width = Math.max(2, view.canvas.clientWidth);
    const height = Math.max(2, view.canvas.clientHeight);
    if (width === view.width && height === view.height) {
      view.dirty = true;
      return;
    }
    view.width = width;
    view.height = height;
    view.renderer.setSize(width, height, false);
    if (view.persp) {
      view.persp.aspect = width / height;
      view.persp.updateProjectionMatrix();
    }
    this.updateOrthoFrustum(view);
    for (const solid of this.solidObjects()) solid.setViewportResolution(view.id, width, height);
    view.dirty = true;
    view.edgeDirty = true;
    if (!this.resizeQueued) {
      this.resizeQueued = true;
      requestAnimationFrame(() => {
        this.resizeQueued = false;
        this.markAllDirty();
        this.markAllEdgesDirty();
      });
    }
  }

  private updateOrthoFrustum(view: ViewRuntime) {
    const aspect = view.width / Math.max(1, view.height);
    const half = ORTHO_BASE / Math.max(0.2, view.zoom);
    view.ortho.left = -half * aspect;
    view.ortho.right = half * aspect;
    view.ortho.top = half;
    view.ortho.bottom = -half;
    view.ortho.updateProjectionMatrix();
  }

  private updateMainOrthoFrustum() {
    const view = this.views.get('perspective');
    if (!view) return;
    const aspect = view.width / Math.max(1, view.height);
    const half = this.orbit.distance * Math.tan((FOV / 2) * (Math.PI / 180));
    view.ortho.left = -half * aspect;
    view.ortho.right = half * aspect;
    view.ortho.top = half;
    view.ortho.bottom = -half;
    view.ortho.updateProjectionMatrix();
  }

  private resetViewCameras() {
    const state = useApp.getState();
    this.orbit.target.set(...state.camera.target);
    this.orbit.yaw = state.camera.yaw;
    this.orbit.pitch = state.camera.pitch;
    this.orbit.distance = state.camera.distance;
    this.mainProjection = state.camera.projection;
    for (const view of this.views.values()) {
      if (view.id !== 'perspective') {
        view.target.set(...state.camera.orthoTarget);
        view.zoom = state.camera.orthoZoom;
      }
      view.dirty = true;
    }
    this.updateAllCameras();
    this.markAllDirty();
    this.markAllEdgesDirty();
  }

  private updateAllCameras() {
    const main = this.views.get('perspective');
    if (main) {
      const camera = this.mainProjection === 'perspective' ? main.persp! : main.ortho;
      const cp = Math.cos(this.orbit.pitch);
      const pos = new THREE.Vector3(
        this.orbit.target.x + this.orbit.distance * cp * Math.cos(this.orbit.yaw),
        this.orbit.target.y + this.orbit.distance * cp * Math.sin(this.orbit.yaw),
        this.orbit.target.z + this.orbit.distance * Math.sin(this.orbit.pitch),
      );
      camera.position.copy(pos);
      camera.up.set(0, 0, 1);
      camera.lookAt(this.orbit.target);
      if (this.mainProjection === 'orthographic') this.updateMainOrthoFrustum();
      else if (main.persp) {
        main.persp.aspect = main.width / Math.max(1, main.height);
        main.persp.updateProjectionMatrix();
      }
      main.camera = camera;
    }
    for (const view of this.views.values()) {
      if (view.id === 'perspective') continue;
      const axis = VIEW_AXIS[view.id as 'front' | 'top' | 'left'];
      view.ortho.position.set(
        view.target.x + axis.pos[0],
        view.target.y + axis.pos[1],
        view.target.z + axis.pos[2],
      );
      view.ortho.up.set(...axis.up);
      view.ortho.lookAt(view.target);
      this.updateOrthoFrustum(view);
    }
  }

  private markAllDirty() {
    for (const view of this.views.values()) view.dirty = true;
  }

  private markViewDirty(id: ViewportId) {
    const view = this.views.get(id);
    if (view) view.dirty = true;
  }

  private markAllEdgesDirty() {
    this.edgeEpoch += 1;
    for (const solid of this.solidObjects()) solid.invalidateEdges();
    for (const view of this.views.values()) {
      view.edgeDirty = true;
      view.dirty = true;
    }
  }

  private solidObjects(): SolidObject[] {
    return [...this.objects.values()].filter((o): o is SolidObject => o instanceof SolidObject);
  }

  private syncEntities(entities: Entity[], initial = false) {
    const present = new Set(entities.map((e) => e.id));
    let changedSolid = false;
    for (const entity of entities) {
      let object = this.objects.get(entity.id);
      if (!object) {
        object = createEntityObject(entity, this.theme);
        this.objects.set(entity.id, object);
        this.entityRoot.add(object.group);
        changedSolid = changedSolid || object instanceof SolidObject;
      } else if (object instanceof SolidObject) {
        if (object.entity !== entity) {
          object.update(entity, this.theme);
          changedSolid = true;
        }
      } else {
        object.update(entity, this.theme);
      }
      object.group.visible = entity.visible;
      if (object instanceof SolidObject) object.group.visible = entity.visible;
    }
    for (const [id, object] of [...this.objects.entries()]) {
      if (!present.has(id)) {
        this.entityRoot.remove(object.group);
        object.dispose();
        this.objects.delete(id);
        changedSolid = true;
      }
    }
    this.selection = new Set(
      useApp
        .getState()
        .selection.filter((s) => !s.part)
        .map((s) => s.id),
    );
    this.selectedParts = new Set(
      useApp
        .getState()
        .selection.filter((s) => s.part)
        .map((s) => `${s.id}:${s.part!.kind}:${s.part!.kind === 'face' || s.part!.kind === 'vertex' || s.part!.kind === 'edge' ? s.part!.index : 0}`),
    );
    if (changedSolid || initial) {
      this.markAllEdgesDirty();
    }
    this.applyClipping();
    this.applyStyles();
    this.rebuildMeasurements();
    this.markAllDirty();
  }

  private bindStore() {
    this.unsubscribe = useApp.subscribe((state, prev) => {
      if (state.entities !== prev.entities) {
        this.syncEntities(state.entities);
      }
      if (state.settings !== prev.settings) {
        this.onSettingsChanged(prev.settings, state.settings);
      }
      if (state.selection !== prev.selection) {
        this.applyStyles();
        this.rebuildMeasurements();
      }
      if (state.camera !== prev.camera && !this.suppressCameraSync) {
        const c = state.camera;
        const mainDelta =
          Math.abs(c.target[0] - this.orbit.target.x) +
          Math.abs(c.target[1] - this.orbit.target.y) +
          Math.abs(c.target[2] - this.orbit.target.z) +
          Math.abs(c.yaw - this.orbit.yaw) +
          Math.abs(c.pitch - this.orbit.pitch) +
          Math.abs(c.distance - this.orbit.distance);
        if (c.projection !== this.mainProjection || mainDelta > 1e-4) {
          this.applyCameraState(c);
        }
        const orthoView = this.views.get('top');
        if (orthoView) {
          const oDelta =
            Math.abs(c.orthoTarget[0] - orthoView.target.x) +
            Math.abs(c.orthoTarget[1] - orthoView.target.y) +
            Math.abs(c.orthoTarget[2] - orthoView.target.z) +
            Math.abs(c.orthoZoom - orthoView.zoom);
          if (oDelta > 1e-4) {
            for (const view of this.views.values()) {
              if (view.id !== 'perspective') {
                view.target.set(...c.orthoTarget);
                view.zoom = c.orthoZoom;
              }
            }
            this.updateAllCameras();
            this.markAllDirty();
          }
        }
      }
      if (state.activeTool !== prev.activeTool) {
        this.cursorTool = state.activeTool;
        this.updateCursors();
      }
    });
    this.cursorTool = useApp.getState().activeTool;
  }

  private applyCameraState(camera: CameraState) {
    this.orbit.target.set(...camera.target);
    this.orbit.yaw = camera.yaw;
    this.orbit.pitch = camera.pitch;
    this.orbit.distance = camera.distance;
    this.mainProjection = camera.projection;
    for (const view of this.views.values()) {
      if (view.id !== 'perspective') {
        view.target.set(...camera.orthoTarget);
        view.zoom = camera.orthoZoom;
      }
    }
    this.updateAllCameras();
    this.markAllDirty();
    this.markAllEdgesDirty();
  }

  private onSettingsChanged(prev: import('../core/types').SceneSettings, next: import('../core/types').SceneSettings) {
    const themeChanged = prev.theme !== next.theme;
    if (themeChanged) {
      this.theme = next.theme;
      this.rebuildHelpers();
      for (const object of this.objects.values()) object.update(object.entity, this.theme);
      this.markAllEdgesDirty();
      this.markAllDirty();
    }
    if (prev.showHidden !== next.showHidden) {
      this.markAllEdgesDirty();
    }
    if (prev.showGrid !== next.showGrid || prev.showAxes !== next.showAxes) {
      this.markAllDirty();
    }
    if (prev.showLabels !== next.showLabels) {
      for (const object of this.objects.values()) object.setLabelsVisible(next.showLabels);
      this.markAllDirty();
    }
    if (prev.showMeasures !== next.showMeasures || themeChanged) {
      this.rebuildMeasurements();
    }
    if (!prev.linked && next.linked) {
      const t = this.orbit.target;
      for (const view of this.views.values()) {
        if (view.id !== 'perspective') {
          view.target.copy(t);
          view.zoom = Math.max(0.35, Math.min(6, 12.5 / this.orbit.distance));
        }
      }
      this.updateAllCameras();
      this.markAllDirty();
    }
    this.applyStyles();
    for (const object of this.objects.values()) object.setLabelsVisible(next.showLabels);
  }

  private applyStyles() {
    const state = useApp.getState();
    const selected = new Set<string>();
    const selectedParts = new Set<string>();
    const hovered = new Set<string>();
    const hoveredParts = new Set<string>();
    for (const ref of state.selection) {
      if (ref.part) {
        selectedParts.add(`${ref.id}:${ref.part.kind}:${ref.part.index}`);
        selected.add(ref.id);
      } else {
        selected.add(ref.id);
      }
    }
    if (this.hoverRef) {
      if (this.hoverRef.part) {
        hoveredParts.add(`${this.hoverRef.id}:${this.hoverRef.part!.kind}:${this.hoverRef.part!.index}`);
        hovered.add(this.hoverRef.id);
      } else {
        hovered.add(this.hoverRef.id);
      }
    }
    this.selection = selected;
    this.selectedParts = selectedParts;
    this.hovered = hovered;
    this.hoveredParts = hoveredParts;
    for (const object of this.objects.values()) {
      if (!object.group.visible && !object.entity.visible) continue;
      object.applyStyle({
        theme: this.theme,
        selected: selected.has(object.id),
        hovered: hovered.has(object.id),
        selectedParts,
        hoveredParts,
        viewport: state.activeViewport,
        wireframe: state.settings.wireframe,
      });
    }
    this.rebuildHighlights();
    this.markAllDirty();
  }

  private clearGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    }
  }

  private rebuildHighlights() {
    this.clearGroup(this.faceHighlightRoot);
    const state = useApp.getState();
    const refs: Array<{ ref: SelectionRef; hover: boolean }> = [];
    for (const ref of state.selection) if (ref.part?.kind === 'face') refs.push({ ref, hover: false });
    if (this.hoverRef?.part?.kind === 'face') refs.push({ ref: this.hoverRef, hover: true });
    for (const { ref, hover } of refs) {
      const entity = state.entities.find((e) => e.id === ref.id);
      if (!entity || entity.type !== 'solid') continue;
      const face = entity.faces[ref.part!.index];
      if (!face) continue;
      const points = face.map((i) => entity.vertices[i]);
      const centroid = polygonCentroid(points);
      const positions: number[] = [];
      for (let i = 1; i < points.length - 1; i += 1) {
        positions.push(...points[0], ...points[i], ...points[i + 1]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({
        color: hover ? HOVER : SELECT,
        transparent: true,
        opacity: hover ? 0.2 : 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 10;
      mesh.raycast = () => {};
      this.faceHighlightRoot.add(mesh);
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([...points, points[0]].map((p) => new THREE.Vector3(...p))),
        new THREE.LineBasicMaterial({
          color: hover ? HOVER : SELECT,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        }),
      );
      outline.raycast = () => {};
      outline.renderOrder = 12;
      this.faceHighlightRoot.add(outline);
      void centroid;
    }
    for (const ref of state.selection) {
      if (ref.part?.kind !== 'edge') continue;
      const entity = state.entities.find((e) => e.id === ref.id);
      if (!entity || entity.type !== 'solid') continue;
      const edge = entity.edges[ref.part.index];
      if (!edge) continue;
      const a = entity.vertices[edge[0]];
      const b = entity.vertices[edge[1]];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]),
        new THREE.LineBasicMaterial({ color: SELECT, depthTest: false }),
      );
      line.renderOrder = 12;
      line.raycast = () => {};
      this.faceHighlightRoot.add(line);
    }
  }

  private rebuildMeasurements() {
    for (const child of [...this.measurementRoot.children]) {
      this.measurementRoot.remove(child);
      if (child instanceof THREE.Sprite) child.material.dispose();
    }
    const state = useApp.getState();
    this.measurementRoot.visible = state.settings.showMeasures;
    if (!state.settings.showMeasures) {
      this.markAllDirty();
      return;
    }
    const geoms = resolveAll(state.selection, state.entities);
    if (!geoms.length) {
      this.markAllDirty();
      return;
    }
    const addLabel = (text: string, point: Vec3) => {
      if (!text) return;
      const label = new LabelSprite(text, {
        theme: this.theme,
        small: true,
        accent: this.theme === 'dark' ? '#fbbf24' : '#b45309',
        muted: false,
      });
      label.setPosition([point[0] + 0.08, point[1] + 0.08, point[2] + 0.13]);
      label.sprite.material.depthTest = false;
      label.sprite.renderOrder = 28;
      this.measurementRoot.add(label.sprite);
    };

    if (geoms.length === 1) {
      const g = geoms[0];
      if (g.kind === 'line' && !g.infinite) {
        addLabel(`|${g.label}| = ${fmt(len(g.dir), 3)}`, mul(add(g.a, g.b), 0.5));
      } else if (g.kind === 'circle') {
        const arc = Math.abs(g.sweep) * g.radius;
        addLabel(`r = ${fmt(g.radius, 3)} · L = ${fmt(arc, 3)}`, add(g.center, [0, 0, 0.2]));
      } else if (g.kind === 'solid') {
        const m = solidMetrics(g.solid);
        addLabel(`S = ${fmt(m.surfaceArea, 3)} · V = ${fmt(m.volume, 3)}`, m.centroid);
      } else if (g.kind === 'section') {
        const p = g.polygons[0]?.centroid;
        if (p) addLabel(`截面 S = ${fmt(g.polygons.reduce((s, q) => s + q.area, 0), 3)}`, p);
      } else if (g.kind === 'face') {
        addLabel(`S = ${fmt(g.area, 3)}`, g.centroid);
      } else if (g.kind === 'vector') {
        addLabel(`|a| = ${fmt(len(g.value), 3)}`, add(g.origin, g.value));
      }
      this.markAllDirty();
      return;
    }

    const points = geoms.filter((g) => g.kind === 'point');
    const lines = geoms.filter((g) => g.kind === 'line');
    const planes = geoms.filter((g) => g.kind === 'plane' || g.kind === 'face');
    const circles = geoms.filter((g) => g.kind === 'circle');
    const vectors = geoms.filter((g) => g.kind === 'vector');
    const solids = geoms.filter((g) => g.kind === 'solid');

    if (points.length === 2 && geoms.length === 2) {
      addLabel(`d = ${fmt(dist(points[0].pos, points[1].pos), 3)}`, mul(add(points[0].pos, points[1].pos), 0.5));
    } else if (points.length >= 3 && geoms.length === points.length) {
      const a = points[0].pos;
      const b = points[1].pos;
      const c = points[2].pos;
      addLabel(`△S = ${fmt(triangleArea(a, b, c), 3)}`, mul(add(add(a, b), c), 1 / 3));
    }

    if (points.length >= 1 && lines.length >= 1) {
      const p = points[0].pos;
      const l = lines[0];
      const t = clamp(dot(sub(p, l.a), l.dir) / Math.max(1e-9, dot(l.dir, l.dir)), 0, 1);
      const foot = add(l.a, mul(l.dir, t));
      addLabel(`d = ${fmt(pointLineDistance(p, l.a, l.dir), 3)}`, mul(add(p, foot), 0.5));
    }
    if (points.length >= 1 && planes.length >= 1) {
      const p = points[0].pos;
      const pl = planes[0];
      const pp = pl.kind === 'plane' ? pl.point : pl.centroid;
      const n = pl.kind === 'plane' ? pl.normal : pl.normal;
      const foot = add(p, mul(norm(n), -dot(sub(p, pp), norm(n))));
      addLabel(`d = ${fmt(pointPlaneDistance(p, pp, n), 3)}`, mul(add(p, foot), 0.5));
    }
    if (lines.length === 2) {
      const [a, b] = lines;
      const closest = lineLineClosest(a.a, a.dir, b.b, b.dir);
      addLabel(
        `θ = ${fmt(acuteLineAngle(a.dir, b.dir), 2)}°`,
        mul(add(closest.a, closest.b), 0.5),
      );
    }
    if (lines.length >= 1 && planes.length >= 1) {
      const l = lines[0];
      const pl = planes[0];
      const pp = pl.kind === 'plane' ? pl.point : pl.centroid;
      const n = pl.kind === 'plane' ? pl.normal : pl.normal;
      const hit = linePlaneIntersection(l.a, l.dir, pp, n);
      const pos = hit ?? add(l.a, mul(l.dir, 0.5));
      addLabel(`线面角 = ${fmt(Math.asin(clamp(Math.abs(dot(norm(l.dir), norm(n))), 0, 1)) * DEG, 2)}°`, pos);
    }
    if (planes.length === 2) {
      const pa = planes[0];
      const pb = planes[1];
      const p1 = pa.kind === 'plane' ? pa.point : pa.centroid;
      const n1 = pa.kind === 'plane' ? pa.normal : pa.normal;
      const p2 = pb.kind === 'plane' ? pb.point : pb.centroid;
      const n2 = pb.kind === 'plane' ? pb.normal : pb.normal;
      const angle = Math.acos(clamp(Math.abs(dot(norm(n1), norm(n2))), 0, 1)) * DEG;
      const inter = planePlaneIntersection(p1, n1, p2, n2);
      const pos = inter ? inter.point : mul(add(p1, p2), 0.5);
      addLabel(`二面角 = ${fmt(angle, 2)}°`, pos);
    }
    if (vectors.length === 2) {
      addLabel(
        `a·b = ${fmt(dot(vectors[0].value, vectors[1].value), 3)} · θ = ${fmt(angleDeg(vectors[0].value, vectors[1].value), 2)}°`,
        mul(add(vectors[0].origin, vectors[1].origin), 0.5),
      );
    }
    if (solids.length >= 1 && planes.length >= 1) {
      const solid = solids[0].solid;
      const pl = planes[0];
      const pp = pl.kind === 'plane' ? pl.point : pl.centroid;
      const n = pl.kind === 'plane' ? pl.normal : pl.normal;
      const polys = sectionPolygons(
        {
          id: '__measure__',
          type: 'section',
          name: 'measure',
          solidId: solid.id,
          plane: { kind: 'free', point: pp, normal: n },
          clip: false,
          fill: true,
          visible: true,
          color: '#fff',
          createdAt: 0,
        },
        [...state.entities],
      );
      if (polys[0]) {
        addLabel(`截面 S = ${fmt(polys.reduce((s, q) => s + q.area, 0), 3)}`, polys[0].centroid);
      }
    }
    if (points.length === 1 && circles.length === 1) {
      const c = circles[0];
      if (pointPlaneDistance(points[0].pos, c.center, c.normal) < 1e-5) {
        addLabel(`与圆心距 = ${fmt(dist(points[0].pos, c.center), 3)}`, points[0].pos);
      }
    }
    this.markAllDirty();
  }

  private applyClipping() {
    const state = useApp.getState();
    const map = new Map<string, THREE.Plane[]>();
    for (const section of state.entities) {
      if (section.type !== 'section' || !section.visible || !section.clip) continue;
      const plane = resolvePlane(section.plane, state.entities);
      if (!plane) continue;
      const p = new THREE.Plane(
        new THREE.Vector3(...plane.normal),
        -dot(plane.normal, plane.point),
      );
      const list = map.get(section.solidId) ?? [];
      list.push(p);
      map.set(section.solidId, list);
    }
    for (const solid of this.solidObjects()) {
      solid.setClipping(map.get(solid.id) ?? []);
    }
  }

  private updateCursors() {
    for (const view of this.views.values()) {
      if (this.drag?.view === view) {
        view.canvas.style.cursor = this.drag.mode === 'vertex' ? 'grabbing' : this.drag.mode === 'orbit' ? 'grabbing' : 'grabbing';
      } else if (this.cursorTool !== 'select') {
        view.canvas.style.cursor = 'crosshair';
      } else {
        view.canvas.style.cursor = view.id === 'perspective' ? 'grab' : 'move';
      }
    }
  }

  // ---------------------------------------------------------------- pointers

  private canonicalView(view: ViewRuntime): ViewRuntime {
    return this.views.get(view.id) ?? view;
  }

  private onPointerDown(view: ViewRuntime, event: PointerEvent) {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    useApp.getState().setActiveViewport(view.id);
    view.canvas.setPointerCapture?.(event.pointerId);
    const hit = this.pickAt(view, event.clientX, event.clientY);
    const anchor = hit ? anchorForSelection(hit.ref, useApp.getState().entities) : null;
    if (event.button === 0 && anchor) {
      const camDir = new THREE.Vector3();
      view.camera.getWorldDirection(camDir);
      const pos = resolveAnchor(anchor, useApp.getState().entities)?.pos;
      if (!pos) return;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        camDir.clone().negate(),
        new THREE.Vector3(...pos),
      );
      this.drag = {
        mode: 'vertex',
        view,
        button: event.button,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        anchor,
        plane,
        startPos: new THREE.Vector3(...pos),
      };
      this.updateCursors();
      event.preventDefault();
      return;
    }
    const mode: DragState['mode'] =
      view.id === 'perspective' && event.button === 0 && !event.shiftKey
        ? 'orbit'
        : 'pan';
    this.drag = {
      mode,
      view,
      button: event.button,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    this.updateCursors();
    event.preventDefault();
  }

  private onPointerMove(view: ViewRuntime, event: PointerEvent) {
    if (this.drag) {
      const dx = event.clientX - this.drag.lastX;
      const dy = event.clientY - this.drag.lastY;
      const total = Math.abs(event.clientX - this.drag.startX) + Math.abs(event.clientY - this.drag.startY);
      if (total > 3) this.drag.moved = true;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      if (this.drag.mode === 'vertex') {
        if (!this.drag.moved) return;
        const anchor = this.drag.anchor;
        if (!anchor) return;
        if (!this.drag.historyStarted) {
          useApp.getState().beginDrag('拖拽顶点');
          this.drag.historyStarted = true;
        }
        const ndc = this.ndc(view, event.clientX, event.clientY);
        this.raycaster.setFromCamera(ndc, view.camera);
        const point = new THREE.Vector3();
        if (this.drag.plane && this.raycaster.ray.intersectPlane(this.drag.plane, point)) {
          let pos: Vec3 = [point.x, point.y, point.z];
          const state = useApp.getState();
          if (state.settings.snap || event.shiftKey) {
            pos = [Math.round(pos[0] * 4) / 4, Math.round(pos[1] * 4) / 4, Math.round(pos[2] * 4) / 4];
          }
          state.moveAnchor(anchor, pos);
          state.setMouseWorld(pos);
          this.markAllDirty();
        }
        return;
      }
      if (this.drag.mode === 'orbit') {
        this.orbit.yaw -= dx * 0.008;
        this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + dy * 0.008, -1.48, 1.48);
        this.updateAllCameras();
        const main = this.views.get('perspective');
        if (main) {
          main.dirty = true;
          main.edgeDirty = true;
        }
        this.scheduleCameraSync();
        return;
      }
      if (this.drag.mode === 'pan') {
        this.panView(this.drag.view, dx, dy);
        this.scheduleCameraSync();
      }
      return;
    }

    const now = performance.now();
    if (now - this.lastHoverCheck > 45) {
      this.lastHoverCheck = now;
      const hit = this.pickAt(view, event.clientX, event.clientY);
      const newRef = hit?.ref ?? null;
      const key = (r: SelectionRef | null) =>
        r ? `${r.id}:${r.part ? `${r.part.kind}:${r.part.index}` : ''}` : '';
      if (key(newRef) !== key(this.hoverRef)) {
        this.hoverRef = newRef;
        this.wholeHoverId = newRef?.id ?? null;
        useApp.getState().setHoverLabel(newRef ? selectionLabel(newRef, useApp.getState().entities) : null);
        this.applyStyles();
        this.updateCursors();
      }
    }
    if (now - this.lastMouseUpdate > 55) {
      this.lastMouseUpdate = now;
      const p = this.worldPointAt(view, event.clientX, event.clientY);
      useApp.getState().setMouseWorld(p);
    }
  }

  private scheduleCameraSync() {
    const now = performance.now();
    if (now - this.lastCameraStoreSync > 120) {
      this.lastCameraStoreSync = now;
      this.syncCameraToStore();
    }
  }

  private onPointerUp(view: ViewRuntime, event: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    try {
      view.canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    if (drag.mode === 'vertex') {
      if (drag.historyStarted) {
        useApp.getState().endDrag();
        this.syncCameraToStore();
      } else if (!drag.moved) {
        const hit = this.pickAt(view, event.clientX, event.clientY);
        if (hit) {
          useApp.getState().handleCanvasPick(hit.ref, hit.point, event.shiftKey || event.ctrlKey || event.metaKey);
        }
      }
      this.updateCursors();
      return;
    }
    if (!drag.moved && drag.button === 0) {
      const hit = this.pickAt(view, event.clientX, event.clientY);
      const p = hit?.point ?? this.worldPointAt(view, event.clientX, event.clientY);
      useApp.getState().handleCanvasPick(hit?.ref ?? null, p, event.shiftKey || event.ctrlKey || event.metaKey);
    }
    this.syncCameraToStore();
    this.updateCursors();
    this.markViewDirty(view.id);
  }

  private onWheel(view: ViewRuntime, event: WheelEvent) {
    event.preventDefault();
    useApp.getState().setActiveViewport(view.id);
    const factor = Math.exp(event.deltaY * 0.0012);
    if (view.id === 'perspective') {
      this.orbit.distance = THREE.MathUtils.clamp(this.orbit.distance * factor, 2.2, 70);
      if (useApp.getState().settings.linked) {
        for (const v of this.views.values()) {
          if (v.id !== 'perspective') v.zoom = THREE.MathUtils.clamp(12.5 / this.orbit.distance, 0.35, 6);
        }
        this.updateAllCameras();
        this.markAllDirty();
      } else {
        this.updateAllCameras();
        view.dirty = true;
        view.edgeDirty = true;
      }
    } else {
      view.zoom = THREE.MathUtils.clamp(view.zoom / factor, 0.3, 8);
      this.updateOrthoFrustum(view);
      view.dirty = true;
      if (useApp.getState().settings.linked) {
        for (const v of this.views.values()) {
          if (v.id !== 'perspective') {
            v.zoom = view.zoom;
            this.updateOrthoFrustum(v);
            v.dirty = true;
          }
        }
        this.orbit.distance = THREE.MathUtils.clamp(12.5 / view.zoom, 2.2, 70);
        this.updateAllCameras();
        this.markAllDirty();
      }
    }
    this.markAllEdgesDirty();
    this.scheduleCameraSync();
  }

  private panView(view: ViewRuntime, dx: number, dy: number) {
    const camera = view.camera;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    if (view.id === 'perspective') {
      camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
      const wpp = (2 * this.orbit.distance * Math.tan((FOV / 2) * (Math.PI / 180))) / Math.max(1, view.height);
      const delta = new THREE.Vector3()
        .addScaledVector(right, -dx * wpp)
        .addScaledVector(up, dy * wpp);
      this.orbit.target.add(delta);
      this.updateAllCameras();
      view.dirty = true;
      view.edgeDirty = true;
      if (useApp.getState().settings.linked) {
        this.applyLinkedTarget(this.orbit.target, null);
      }
    } else {
      const axis = VIEW_AXIS[view.id as 'front' | 'top' | 'left'];
      right.set(...axis.right);
      up.set(...axis.up);
      const half = ORTHO_BASE / Math.max(0.2, view.zoom);
      const wpp = (2 * half) / Math.max(1, view.height);
      const delta = new THREE.Vector3()
        .addScaledVector(right, -dx * wpp)
        .addScaledVector(up, dy * wpp);
      view.target.add(delta);
      this.updateAllCameras();
      view.dirty = true;
      if (useApp.getState().settings.linked) {
        this.applyLinkedTarget(view.target, view.id);
      }
    }
    this.markAllEdgesDirty();
  }

  private applyLinkedTarget(target: THREE.Vector3, except: ViewportId | null) {
    this.orbit.target.copy(target);
    for (const v of this.views.values()) {
      if (v.id !== except) v.target.copy(target);
    }
    this.updateAllCameras();
    this.markAllDirty();
  }

  private ndc(view: ViewRuntime, clientX: number, clientY: number) {
    const rect = view.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
  }

  private worldPointAt(view: ViewRuntime, clientX: number, clientY: number): Vec3 {
    const ndc = this.ndc(view, clientX, clientY);
    this.raycaster.setFromCamera(ndc, view.camera);
    let plane: THREE.Plane;
    if (view.id === 'front') plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    else if (view.id === 'left') plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    else plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, point)) {
      return [
        Math.round(point.x * 1000) / 1000,
        Math.round(point.y * 1000) / 1000,
        Math.round(point.z * 1000) / 1000,
      ];
    }
    const dir = new THREE.Vector3();
    view.camera.getWorldDirection(dir);
    const center = view.id === 'perspective' ? this.orbit.target : view.target;
    const origin = new THREE.Vector3(...center);
    const fallback = origin.clone().addScaledVector(dir, 1);
    return [fallback.x, fallback.y, fallback.z];
  }

  private pickAt(view: ViewRuntime, clientX: number, clientY: number): { ref: SelectionRef; point: Vec3 } | null {
    const ndc = this.ndc(view, clientX, clientY);
    this.raycaster.setFromCamera(ndc, view.camera);
    const intersections = this.raycaster.intersectObjects(this.entityRoot.children, true);
    for (const hit of intersections) {
      if (!this.isVisibleInTree(hit.object)) continue;
      const pickRef = hit.object.userData?.pickRef as SelectionRef | undefined;
      if (pickRef) {
        return {
          ref: structuredClone(pickRef),
          point: [hit.point.x, hit.point.y, hit.point.z],
        };
      }
      const solidId = hit.object.userData?.solidId as string | undefined;
      if (solidId) {
        const state = useApp.getState();
        const solid = state.entities.find((e) => e.id === solidId);
        if (!solid || solid.type !== 'solid') continue;
        if (state.selectionMode === 'face') {
          const map = (hit.object.userData?.faceMap as number[] | undefined) ?? [];
          const faceIndex = map[hit.faceIndex ?? 0] ?? 0;
          return {
            ref: { id: solidId, part: { kind: 'face', index: faceIndex } },
            point: [hit.point.x, hit.point.y, hit.point.z],
          };
        }
        return {
          ref: { id: solidId },
          point: [hit.point.x, hit.point.y, hit.point.z],
        };
      }
    }
    return null;
  }

  private isVisibleInTree(object: THREE.Object3D | null): boolean {
    let node: THREE.Object3D | null = object;
    while (node) {
      if (!node.visible) return false;
      node = node.parent;
    }
    return true;
  }

  // ---------------------------------------------------------------- rendering

  private animate(now: number) {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const state = useApp.getState();
    if (state.settings.autoRotate && !this.drag) {
      this.orbit.yaw += dt * state.settings.autoRotateSpeed;
      this.updateAllCameras();
      const main = this.views.get('perspective');
      if (main) {
        main.dirty = true;
        main.edgeDirty = true;
      }
      if (now - this.lastAutoSave > 500) {
        this.lastAutoSave = now;
        this.syncCameraToStore();
      }
    }
    this.tickAnimations(now, dt);
    for (const view of this.views.values()) {
      if (!view.dirty) continue;
      this.renderView(view, now);
    }
    this.animationId = requestAnimationFrame(this.animate);
  }

  private renderView(view: ViewRuntime, now: number) {
    this.setHelperVisibility(view.id);
    if (view.edgeDirty) {
      if (now - view.lastEdgeCompute > 85 || view.lastEdgeCompute === 0) {
        this.computeEdgeData(view);
        view.lastEdgeCompute = now;
        view.edgeDirty = false;
      } else if (view.edgeTimer == null) {
        const delay = 85 - (now - view.lastEdgeCompute);
        view.edgeTimer = window.setTimeout(() => {
          view.edgeTimer = null;
          view.edgeDirty = true;
          view.dirty = true;
        }, Math.max(10, delay));
        // Keep rendering the previous classification this frame.
      }
    }
    for (const solid of this.solidObjects()) {
      solid.setEdgeViewport(view.id);
      solid.setViewportResolution(view.id, view.width, view.height);
    }
    view.renderer.render(this.scene, view.camera);
    view.dirty = false;
  }

  private setHelperVisibility(viewId: ViewportId) {
    const state = useApp.getState();
    this.gridGroup.visible = state.settings.showGrid;
    this.axisGroup.visible = state.settings.showAxes;
    for (const [key, grid] of this.grids) {
      const target =
        key === 'xy' && (viewId === 'perspective' || viewId === 'top')
          ? true
          : key === 'xz' && viewId === 'front'
            ? true
            : key === 'yz' && viewId === 'left';
      grid.visible = target && state.settings.showGrid;
    }
  }

  private computeEdgeData(view: ViewRuntime) {
    const state = useApp.getState();
    const showHidden = state.settings.showHidden;
    const camera = view.camera;
    camera.updateMatrixWorld();
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const camKey = camera.matrixWorld.elements.map((n) => n.toFixed(3)).join(',');
    const projKey = camera.projectionMatrix.elements.map((n) => n.toFixed(3)).join(',');
    const key = `${this.edgeEpoch}:${showHidden ? 1 : 0}:${camKey}:${projKey}`;
    for (const solid of this.solidObjects()) {
      const entity = solid.entity as SolidEntity;
      if (!entity.visible) continue;
      const visible: number[] = [];
      const hidden: number[] = [];
      if (!showHidden) {
        for (const [ia, ib] of entity.edges) {
          visible.push(...entity.vertices[ia], ...entity.vertices[ib]);
        }
        solid.setEdgeData(view.id, visible, hidden, key);
        continue;
      }
      solid.mesh.updateMatrixWorld(true);
      const ortho = view.camera instanceof THREE.OrthographicCamera;
      for (const [ia, ib] of entity.edges) {
        const a = new THREE.Vector3(...entity.vertices[ia]);
        const b = new THREE.Vector3(...entity.vertices[ib]);
        const segments = 4;
        for (let i = 0; i < segments; i += 1) {
          const t0 = i / segments;
          const t1 = (i + 1) / segments;
          const p0 = a.clone().lerp(b, t0);
          const p1 = a.clone().lerp(b, t1);
          const mid = a.clone().lerp(b, (t0 + t1) / 2);
          let origin = camPos.clone();
          let dir = mid.clone().sub(camPos);
          let far = dir.length();
          if (ortho) {
            dir = camDir.clone();
            origin = mid.clone().addScaledVector(camDir, -80);
            far = 80;
          } else {
            dir.normalize();
          }
          this.raycaster.set(origin, dir);
          this.raycaster.near = 0.01;
          this.raycaster.far = Math.max(0.02, far - 0.012);
          const hits = this.raycaster.intersectObject(solid.mesh, false);
          const isHidden = hits.some((h) => h.distance > 0.005);
          if (isHidden) hidden.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
          else visible.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }
      }
      solid.setEdgeData(view.id, visible, hidden, key);
    }
  }

  // ---------------------------------------------------------------- camera API

  private syncCameraToStore() {
    const state = useApp.getState();
    const top = this.views.get('top');
    const camera: CameraState = {
      target: this.orbit.target.toArray() as Vec3,
      yaw: this.orbit.yaw,
      pitch: this.orbit.pitch,
      distance: this.orbit.distance,
      projection: this.mainProjection,
      orthoTarget: (top?.target.toArray() as Vec3) ?? [0, 0, 0],
      orthoZoom: top?.zoom ?? 1,
    };
    this.suppressCameraSync = true;
    state.setCamera(camera);
    window.setTimeout(() => {
      this.suppressCameraSync = false;
    }, 0);
  }

  getCameraState(): CameraState {
    const top = this.views.get('top');
    return {
      target: this.orbit.target.toArray() as Vec3,
      yaw: this.orbit.yaw,
      pitch: this.orbit.pitch,
      distance: this.orbit.distance,
      projection: this.mainProjection,
      orthoTarget: (top?.target.toArray() as Vec3) ?? [0, 0, 0],
      orthoZoom: top?.zoom ?? 1,
    };
  }

  resetViews(updateStore = true) {
    this.orbit.target.set(0, 0, 1.15);
    this.orbit.yaw = -0.92;
    this.orbit.pitch = 0.42;
    this.orbit.distance = 12.5;
    this.mainProjection = 'perspective';
    for (const view of this.views.values()) {
      if (view.id !== 'perspective') {
        view.target.set(0, 0, 1.15);
        view.zoom = 1;
      }
    }
    this.updateAllCameras();
    this.markAllDirty();
    this.markAllEdgesDirty();
    if (updateStore) this.syncCameraToStore();
  }

  toggleMainProjection(): 'perspective' | 'orthographic' {
    this.mainProjection = this.mainProjection === 'perspective' ? 'orthographic' : 'perspective';
    this.updateAllCameras();
    this.markAllDirty();
    this.markAllEdgesDirty();
    this.syncCameraToStore();
    useApp.getState().toast(
      this.mainProjection === 'perspective' ? '主视口已切换为透视投影' : '主视口已切换为正交投影',
      'info',
    );
    return this.mainProjection;
  }

  private fitBounds(center: THREE.Vector3, size: number) {
    this.orbit.target.copy(center);
    this.orbit.distance = THREE.MathUtils.clamp(size * 1.8 + 3.5, 3.5, 60);
    const zoom = THREE.MathUtils.clamp(8.5 / Math.max(1, size), 0.4, 5);
    for (const view of this.views.values()) {
      if (view.id !== 'perspective') {
        view.target.copy(center);
        view.zoom = zoom;
      }
    }
    this.updateAllCameras();
    this.markAllDirty();
    this.markAllEdgesDirty();
    this.syncCameraToStore();
  }

  fitAll() {
    const state = useApp.getState();
    const points: Vec3[] = [];
    for (const entity of state.entities) {
      if (entity.type === 'solid') points.push(...entity.vertices);
      else if (entity.type === 'point') points.push(entity.pos);
      else if (entity.type === 'segment' || entity.type === 'line') {
        const seg = resolveSegment(entity, state.entities);
        if (seg) points.push(seg.a, seg.b);
      } else if (entity.type === 'circle') {
        const c = resolveCircle(entity, state.entities);
        if (c) {
          points.push(...makeCirclePoints(c.center, c.normal, c.radius, c.startAngle, c.sweep, 36));
        }
      } else if (entity.type === 'plane') {
        const p = resolvePlane(entity.definition, state.entities);
        if (p) points.push(p.point);
      } else if (entity.type === 'section') {
        points.push(...sectionPolygons(entity, state.entities).flatMap((p) => p.points));
      }
    }
    if (!points.length) {
      this.fitBounds(new THREE.Vector3(0, 0, 1), 4);
      return;
    }
    const box = new THREE.Box3();
    for (const p of points) box.expandByPoint(new THREE.Vector3(...p));
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(1.6, box.getSize(new THREE.Vector3()).length());
    this.fitBounds(center, size);
  }

  fitSelection() {
    const state = useApp.getState();
    if (!state.selection.length) {
      this.fitAll();
      return;
    }
    const points: Vec3[] = [];
    for (const ref of state.selection) {
      const entity = state.entities.find((e) => e.id === ref.id);
      if (!entity) continue;
      if (entity.type === 'solid') {
        if (ref.part?.kind === 'vertex') {
          const p = entity.vertices[ref.part.index];
          if (p) points.push(p);
        } else if (ref.part?.kind === 'face') {
          const face = entity.faces[ref.part.index];
          if (face) points.push(...face.map((i) => entity.vertices[i]));
        } else points.push(...entity.vertices);
      } else if (entity.type === 'point') points.push(entity.pos);
      else if (entity.type === 'segment' || entity.type === 'line') {
        const seg = resolveSegment(entity, state.entities);
        if (seg) points.push(seg.a, seg.b);
      } else if (entity.type === 'circle') {
        const c = resolveCircle(entity, state.entities);
        if (c) points.push(...makeCirclePoints(c.center, c.normal, c.radius, c.startAngle, c.sweep, 48));
      } else if (entity.type === 'section') {
        points.push(...sectionPolygons(entity, state.entities).flatMap((p) => p.points));
      }
    }
    if (!points.length) {
      this.fitAll();
      return;
    }
    const box = new THREE.Box3();
    for (const p of points) box.expandByPoint(new THREE.Vector3(...p));
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(1.2, box.getSize(new THREE.Vector3()).length());
    this.fitBounds(center, size);
  }

  // ---------------------------------------------------------------- animations

  stopAnimations() {
    if (this.trace) {
      this.animationRoot.remove(this.trace.marker, this.trace.trail);
      this.trace.marker.geometry.dispose();
      (this.trace.marker.material as THREE.Material).dispose();
      this.trace.trail.geometry.dispose();
      (this.trace.trail.material as THREE.Material).dispose();
      this.trace = null;
    }
    if (this.revolve) {
      this.animationRoot.remove(this.revolve.group);
      this.revolve.mesh.geometry.dispose();
      (this.revolve.mesh.material as THREE.Material).dispose();
      this.revolve.ghost.geometry.dispose();
      (this.revolve.ghost.material as THREE.Material).dispose();
      this.revolve = null;
    }
    if (this.fade) {
      for (const e of this.fade.entries) {
        if ('opacity' in e.material) (e.material as THREE.Material & { opacity: number }).opacity = e.baseOpacity;
      }
      this.fade = null;
    }
  }

  startTraceAnimation(): boolean {
    const state = useApp.getState();
    const geoms = state.selection
      .map((r) => ({
        ref: r,
        entity: state.entities.find((e) => e.id === r.id),
      }))
      .filter((x) => Boolean(x.entity));
    const line = geoms.find((g) => g.entity?.type === 'segment' || g.entity?.type === 'line');
    const circle = geoms.find((g) => g.entity?.type === 'circle');
    let path: Vec3[] | null = null;
    let kind: 'segment' | 'circle' = 'segment';
    if (line && (line.entity!.type === 'segment' || line.entity!.type === 'line')) {
      const seg = resolveSegment(line.entity as never, state.entities);
      if (seg) {
        const length = len(sub(seg.b, seg.a));
        const dir = norm(sub(seg.b, seg.a));
        if (line.entity!.type === 'line') {
          const c = mul(add(seg.a, seg.b), 0.5);
          path = [sub(c, mul(dir, 4)), add(c, mul(dir, 4))];
        } else {
          path = [seg.a, seg.b];
        }
        kind = 'segment';
        void length;
      }
    } else if (circle && circle.entity!.type === 'circle') {
      const c = resolveCircle(circle.entity as never, state.entities);
      if (c) {
        path = makeCirclePoints(c.center, c.normal, c.radius, c.startAngle, c.sweep, 160);
        kind = 'circle';
      }
    }
    if (!path || path.length < 2) {
      useApp.getState().toast('动点轨迹需要选中一条线段/直线或圆', 'warn');
      return false;
    }
    this.stopAnimations();
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 18, 14),
      new THREE.MeshBasicMaterial({ color: '#fbbf24', depthTest: false }),
    );
    marker.renderOrder = 20;
    const trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...path[0])]),
      new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.95, depthTest: false }),
    );
    trail.renderOrder = 19;
    this.animationRoot.add(marker, trail);
    this.trace = {
      points: path,
      t: 0,
      duration: 6,
      marker,
      trail,
      trailPoints: [path[0]],
      pathKind: kind,
      pingPong: kind === 'segment',
    };
    this.markAllDirty();
    useApp.getState().toast(kind === 'circle' ? '圆周动点轨迹演示中' : '线段动点轨迹演示中', 'info');
    return true;
  }

  startRevolveAnimation(): boolean {
    const state = useApp.getState();
    const entity = state.selection
      .map((r) => state.entities.find((e) => e.id === r.id))
      .find((e) => e?.type === 'segment' || e?.type === 'line');
    if (!entity || (entity.type !== 'segment' && entity.type !== 'line')) {
      useApp.getState().toast('旋转体生成动画需要选中一条线段或直线', 'warn');
      return false;
    }
    const seg = resolveSegment(entity, state.entities);
    if (!seg) return false;
    this.stopAnimations();
    const group = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    const ghost = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...seg.a), new THREE.Vector3(...seg.b)]),
      new THREE.LineBasicMaterial({ color: '#fbbf24', depthTest: false }),
    );
    ghost.renderOrder = 15;
    group.add(mesh, ghost);
    this.animationRoot.add(group);
    this.revolve = {
      p0: seg.a,
      p1: seg.b,
      angle: 0,
      duration: 4.2,
      mesh,
      ghost,
      group,
    };
    this.markAllDirty();
    useApp.getState().toast('绕 Z 轴生成旋转体演示中', 'info');
    return true;
  }

  pulseSelection(): boolean {
    const state = useApp.getState();
    if (!state.selection.length) {
      useApp.getState().toast('请先选择要闪烁显示的图元', 'warn');
      return false;
    }
    const entries: Array<{ material: THREE.Material; baseOpacity: number }> = [];
    for (const ref of state.selection) {
      const object = this.objects.get(ref.id);
      if (!object) continue;
      object.group.traverse((child) => {
        const mats = (child as THREE.Mesh).material;
        if (!mats) return;
        const list = Array.isArray(mats) ? mats : [mats];
        for (const mat of list) {
          if ('opacity' in mat) {
            const m = mat as THREE.Material & { opacity: number; transparent: boolean };
            entries.push({ material: m, baseOpacity: m.opacity });
            m.transparent = true;
          }
        }
      });
    }
    if (!entries.length) return false;
    this.fade = { started: performance.now(), duration: 2600, entries };
    this.markAllDirty();
    useApp.getState().toast('辅助线显隐动画', 'info');
    return true;
  }

  private tickAnimations(now: number, dt: number) {
    if (this.trace) {
      const tr = this.trace;
      tr.t += dt / tr.duration;
      const t = tr.pingPong ? (tr.t % 2 <= 1 ? tr.t % 1 : 2 - (tr.t % 2)) : tr.t % 1;
      const n = tr.points.length - 1;
      const idx = Math.min(n - 1, Math.floor(t * n));
      const local = t * n - idx;
      const pos = add(tr.points[idx], mul(sub(tr.points[idx + 1], tr.points[idx]), local));
      tr.marker.position.set(...pos);
      if (!tr.trailPoints.length || dist(tr.trailPoints[tr.trailPoints.length - 1], pos) > 0.012) {
        tr.trailPoints.push(pos);
        if (tr.trailPoints.length > 2400) tr.trailPoints.shift();
        tr.trail.geometry.dispose();
        tr.trail.geometry = new THREE.BufferGeometry().setFromPoints(
          tr.trailPoints.map((p) => new THREE.Vector3(...p)),
        );
      }
      this.markAllDirty();
    }
    if (this.revolve) {
      const rv = this.revolve;
      rv.angle = Math.min(Math.PI * 2, rv.angle + (dt / rv.duration) * Math.PI * 2);
      const steps = Math.max(2, Math.ceil((rv.angle / (Math.PI * 2)) * 96));
      const positions: number[] = [];
      for (let i = 0; i < steps; i += 1) {
        const a0 = (rv.angle * i) / steps;
        const a1 = (rv.angle * (i + 1)) / steps;
        const p0a = rotateZ(rv.p0, a0);
        const p1a = rotateZ(rv.p1, a0);
        const p0b = rotateZ(rv.p0, a1);
        const p1b = rotateZ(rv.p1, a1);
        positions.push(...p0a, ...p1a, ...p1b, ...p0a, ...p1b, ...p0b);
      }
      rv.mesh.geometry.dispose();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      rv.mesh.geometry = geo;
      const g0 = rotateZ(rv.p0, rv.angle);
      const g1 = rotateZ(rv.p1, rv.angle);
      rv.ghost.geometry.dispose();
      rv.ghost.geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...g0),
        new THREE.Vector3(...g1),
      ]);
      this.markAllDirty();
      if (rv.angle >= Math.PI * 2 - 1e-4) {
        this.revolve = null;
        useApp.getState().toast('旋转体生成完成', 'success');
      }
    }
    if (this.fade) {
      const elapsed = now - this.fade.started;
      const p = elapsed / this.fade.duration;
      if (p >= 1) {
        for (const e of this.fade.entries) {
          if ('opacity' in e.material) (e.material as THREE.Material & { opacity: number }).opacity = e.baseOpacity;
        }
        this.fade = null;
      } else {
        const wave = 0.5 + 0.5 * Math.cos(p * Math.PI * 6);
        for (const e of this.fade.entries) {
          if ('opacity' in e.material) {
            (e.material as THREE.Material & { opacity: number }).opacity = Math.max(0.05, e.baseOpacity * (0.2 + 0.8 * wave));
          }
        }
      }
      this.markAllDirty();
    }
  }

  // ---------------------------------------------------------------- export API

  async exportActivePNG(): Promise<{ dataUrl: string; width: number; height: number }> {
    const active = useApp.getState().activeViewport;
    const view = this.views.get(active) ?? this.views.get('perspective')!;
    view.camera.updateMatrixWorld();
    this.computeEdgeDataForce(view);
    this.setHelperVisibility(view.id);
    for (const solid of this.solidObjects()) solid.setEdgeViewport(view.id);
    const w = Math.max(320, Math.round(view.width * 2));
    const h = Math.max(240, Math.round(view.height * 2));
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.localClippingEnabled = true;
    const oldResolutions: Array<{ view: ViewportId; w: number; h: number }> = [];
    for (const solid of this.solidObjects()) {
      for (const v of ALL_VIEWS) {
        const g = solid.edgeGroups.get(v);
        if (g) {
          oldResolutions.push({ view: v, w: g.visibleMat.resolution.x, h: g.visibleMat.resolution.y });
          g.visibleMat.resolution.set(w, h);
        }
      }
    }
    renderer.render(this.scene, view.camera);
    const source = renderer.domElement;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    if (this.theme === 'dark') {
      grad.addColorStop(0, '#0b1220');
      grad.addColorStop(0.55, '#0d1626');
      grad.addColorStop(1, '#111827');
    } else {
      grad.addColorStop(0, '#f8fafc');
      grad.addColorStop(0.55, '#eef4fb');
      grad.addColorStop(1, '#e2e8f0');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0);
    renderer.dispose();
    for (const solid of this.solidObjects()) {
      for (const rec of oldResolutions) {
        const g = solid.edgeGroups.get(rec.view);
        if (g) g.visibleMat.resolution.set(rec.w, rec.h);
      }
    }
    for (const viewRt of this.views.values()) viewRt.dirty = true;
    return { dataUrl: out.toDataURL('image/png'), width: w, height: h };
  }

  private computeEdgeDataForce(view: ViewRuntime) {
    view.edgeDirty = false;
    this.computeEdgeData(view);
    view.lastEdgeCompute = performance.now();
  }

  exportActiveSVG(): string {
    const active = useApp.getState().activeViewport;
    const view = this.views.get(active) ?? this.views.get('perspective')!;
    view.camera.updateMatrixWorld();
    this.computeEdgeDataForce(view);
    const state = useApp.getState();
    return exportSVG({
      camera: view.camera,
      width: view.width,
      height: view.height,
      theme: this.theme,
      settings: state.settings,
      entities: state.entities,
      selection: state.selection,
      viewport: view.id,
      edgesFor: (solid) => this.getEdgeSegmentsForView(solid, view),
    });
  }

  exportThreeViewSVG(): string {
    const state = useApp.getState();
    const panels: Array<{
      title: string;
      subtitle: string;
      camera: THREE.Camera;
      edges: Map<string, ExportEdgeData>;
    }> = [];
    for (const id of ['front', 'top', 'left'] as const) {
      const view = this.views.get(id);
      if (!view) continue;
      this.computeEdgeDataForce(view);
      const aspect = 760 / 720;
      const half = ORTHO_BASE / Math.max(0.2, view.zoom);
      const camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 400);
      const axis = VIEW_AXIS[id];
      camera.position.set(
        view.target.x + axis.pos[0],
        view.target.y + axis.pos[1],
        view.target.z + axis.pos[2],
      );
      camera.up.set(...axis.up);
      camera.lookAt(view.target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const edges = new Map<string, ExportEdgeData>();
      for (const solid of this.solidObjects()) {
        edges.set(solid.id, this.getEdgeSegmentsForView(solid.entity as SolidEntity, view));
      }
      panels.push({
        title: id === 'front' ? '正视图' : id === 'top' ? '俯视图' : '左视图',
        subtitle: id === 'front' ? 'FRONT / 从前方观察' : id === 'top' ? 'TOP / 从上方观察' : 'LEFT / 从左侧观察',
        camera,
        edges,
      });
    }
    return exportThreeViewSVG({
      panels,
      entities: state.entities,
      theme: this.theme,
    });
  }

  exportOBJ(): string {
    return exportOBJ(useApp.getState().entities);
  }

  exportSection(sectionId: string, format: 'svg' | 'obj'): string | null {
    const state = useApp.getState();
    const section = state.entities.find((e) => e.type === 'section' && e.id === sectionId);
    if (!section || section.type !== 'section') return null;
    const polygons = sectionPolygons(section, state.entities);
    if (!polygons.length) return null;
    if (format === 'obj') return exportSectionOBJ(polygons, section.name);
    const active = state.activeViewport;
    const view = this.views.get(active) ?? this.views.get('perspective')!;
    view.camera.updateMatrixWorld();
    return exportSectionSVG(polygons, section.name, view.camera, view.width / view.height, this.theme);
  }

  screenshotCanvas(viewport?: ViewportId): HTMLCanvasElement | null {
    const id = viewport ?? useApp.getState().activeViewport;
    const view = this.views.get(id);
    if (!view) return null;
    view.renderer.render(this.scene, view.camera);
    return view.canvas;
  }

  setAutoRotate(value: boolean) {
    useApp.getState().setSettings({ autoRotate: value });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    this.unsubscribe?.();
    this.stopAnimations();
    for (const view of this.views.values()) {
      view.resizeObserver?.disconnect();
      if (view.edgeTimer) window.clearTimeout(view.edgeTimer);
      view.renderer.dispose();
    }
    for (const object of this.objects.values()) object.dispose();
    this.objects.clear();
    registerViewportController(null);
    setEntityProvider(() => []);
  }

  // Helpers exposed to exporters (kept public on purpose).
  public getViews() {
    return this.views;
  }

  public getObject(id: string) {
    return this.objects.get(id);
  }

  public getSolidObjects() {
    return this.solidObjects();
  }

  public screenPoint(viewport: ViewportId, point: Vec3): { x: number; y: number } | null {
    const view = this.views.get(viewport);
    if (!view) return null;
    view.camera.updateMatrixWorld();
    const v = new THREE.Vector3(point[0], point[1], point[2]).project(view.camera);
    const rect = view.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  }

  public getEdgeSegmentsForView(entity: SolidEntity, view: ViewRuntime): { visible: number[]; hidden: number[] } {
    const solid = this.objects.get(entity.id);
    if (!(solid instanceof SolidObject)) return { visible: [], hidden: [] };
    const group = solid.edgeGroups.get(view.id);
    if (!group) return { visible: [], hidden: [] };
    const read = (obj: THREE.Object3D & { geometry?: THREE.BufferGeometry }) => {
      const attr = obj.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (!attr) return [] as number[];
      return Array.from(attr.array as Float32Array);
    };
    // LineSegments2 stores instanceStart/instanceEnd attributes rather than position.
    const readLine2 = (line: { geometry: unknown }) => {
      const geom = line.geometry as { attributes?: Record<string, THREE.BufferAttribute> };
      const start = geom.attributes?.instanceStart;
      const end = geom.attributes?.instanceEnd;
      if (!start || !end) return [] as number[];
      const out: number[] = [];
      for (let i = 0; i < start.count; i += 1) {
        out.push(start.getX(i), start.getY(i), start.getZ(i), end.getX(i), end.getY(i), end.getZ(i));
      }
      return out;
    };
    return {
      visible: readLine2(group.visible),
      hidden: read(group.hidden as unknown as THREE.Object3D & { geometry?: THREE.BufferGeometry }),
    };
  }
}

function rotateZ(p: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}
