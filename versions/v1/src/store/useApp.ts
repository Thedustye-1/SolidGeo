import { create } from 'zustand';
import type {
  Anchor,
  CameraState,
  Entity,
  MeasurementItem,
  PlaneDef,
  SceneSettings,
  SelectionRef,
  SolidEntity,
  SolidType,
  ToolMode,
  Vec3,
  VectorEntity,
  ViewportId,
  ProjectFile,
  VectorSteps,
} from '../core/types';
import {
  add,
  angleDeg,
  clamp,
  cross,
  directionCosines,
  dot,
  fmt,
  fmtVec,
  len,
  lineLineClosest,
  linePlaneIntersection,
  mul,
  norm,
  planePlaneIntersection,
  projectionVector,
  sub,
} from '../core/math';
import {
  allocateNames,
  anchorForSelection,
  anchorKey,
  buildSolid,
  entityDisplayType,
  makeCircle,
  makeExtrudedSolid,
  makeLine,
  makePlane,
  makePoint,
  makeSection,
  makeSegment,
  makeSolid,
  makeVector,
  nextEntityName,
  nextName,
  resolveAnchor,
  resolvePlane,
  resolveSegment,
  resolveVector,
  solidMetrics,
  SOLID_NAMES,
} from '../core/entities';
import {
  resolveAll,
  runMeasure,
  selectedVectorsInfo,
  selectionMetrics,
  selectionRelations,
  vectorStepsForDihedral,
  vectorStepsForLinePlane,
  type Geom,
  type MeasureKind,
} from '../core/analysis';

export type LeftTab = 'create' | 'construct' | 'scene';
export type RightTab = 'props' | 'measure' | 'vector' | 'animate';
export type SelectionMode = 'entity' | 'vertex' | 'face';

export interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'warn' | 'error';
}

export type DialogState =
  | { kind: 'point'; pos?: Vec3 }
  | { kind: 'solid'; solidType: SolidType }
  | { kind: 'circle' }
  | { kind: 'vector' }
  | { kind: 'vector-scalar' }
  | { kind: 'extrude'; points: Vec3[]; normal: Vec3 }
  | { kind: 'section'; solidId?: string }
  | { kind: 'help'; page: 'guide' | 'shortcuts' | 'about' }
  | { kind: 'new-confirm' };

export interface VectorReport {
  title: string;
  steps: string[];
  result: string;
  resultValue?: Vec3;
  scalarValue?: number;
  origin?: Vec3;
}

export interface MeasureReport {
  title: string;
  items: MeasurementItem[];
  steps?: VectorSteps;
  selection: string;
}

interface HistoryEntry {
  label: string;
  entities: Entity[];
  selection: SelectionRef[];
}

export interface AppState {
  entities: Entity[];
  selection: SelectionRef[];
  selectionMode: SelectionMode;
  activeTool: ToolMode;
  pendingAnchors: Anchor[];
  activeViewport: ViewportId;
  leftTab: LeftTab;
  rightTab: RightTab;
  settings: SceneSettings;
  camera: CameraState;
  docName: string;
  dirty: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  dragActive: boolean;
  mouseWorld: Vec3 | null;
  hoverLabel: string | null;
  dialog: DialogState | null;
  toasts: ToastItem[];
  measureReport: MeasureReport | null;
  vectorReport: VectorReport | null;
  saving: boolean;
  lastSavedAt: string | null;

  setLeftTab: (tab: LeftTab) => void;
  setRightTab: (tab: RightTab) => void;
  setActiveViewport: (vp: ViewportId) => void;
  setActiveTool: (tool: ToolMode) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setSelection: (refs: SelectionRef[]) => void;
  selectRef: (ref: SelectionRef, additive: boolean) => void;
  clearSelection: () => void;
  setMouseWorld: (p: Vec3 | null) => void;
  setHoverLabel: (label: string | null) => void;
  setCamera: (camera: CameraState) => void;
  setSettings: (patch: Partial<SceneSettings>) => void;
  setDocName: (name: string) => void;
  setDialog: (dialog: DialogState | null) => void;
  toast: (message: string, tone?: ToastItem['tone']) => void;
  dismissToast: (id: number) => void;
  dismissMeasure: () => void;
  dismissVector: () => void;

  beginDrag: (label?: string) => void;
  endDrag: () => void;
  recordSnapshot: (label: string) => void;
  moveAnchor: (anchor: Anchor, pos: Vec3, record?: boolean) => void;
  updatePointPosition: (id: string, pos: Vec3, record?: boolean) => void;
  updateEntity: (id: string, updater: (entity: Entity) => Entity, label?: string) => void;
  renameEntity: (id: string, name: string) => void;
  regenerateSolid: (id: string, params: Record<string, number>) => void;
  updateCircleParams: (id: string, patch: { radius?: number; sweep?: number; normal?: Vec3 }) => void;
  setSolidOpacity: (id: string, opacity: number) => void;
  toggleVisibility: (id: string) => void;
  deleteSelected: () => void;
  deleteByIds: (ids: string[]) => void;
  clearScene: () => void;

  addEntities: (newEntities: Entity[], label: string, selection?: SelectionRef[]) => void;
  handleCanvasPick: (pick: SelectionRef | null, world: Vec3, additive: boolean) => void;
  createPointAt: (pos: Vec3) => void;
  createSolid: (solidType: SolidType, params: Record<string, number>) => void;
  createCircle: (params: {
    center: Vec3;
    normal: Vec3;
    radius: number;
    sweepDeg: number;
    startAngleDeg: number;
  }) => void;
  createVector: (origin: Vec3, value: Vec3) => void;
  createVectorFromSelection: () => void;
  constructMidpoint: () => void;
  constructIntersection: () => void;
  constructFoot: () => void;
  constructProjection: () => void;
  constructPlaneThree: () => void;
  constructPlaneLinePoint: () => void;
  prepareExtrude: () => void;
  createExtrude: (height: number) => void;
  openSection: () => void;
  createSection: (solidId: string, planeId: string, options?: { clip?: boolean; fill?: boolean }) => void;
  createAxisSection: (solidId: string, axis: 'x' | 'y' | 'z', offset: number) => void;
  measure: (kind: MeasureKind) => void;
  measureSelection: () => void;
  vectorOp: (
    op: 'add' | 'sub' | 'dot' | 'cross' | 'unit' | 'projection' | 'scalar' | 'magnitude' | 'angle',
    scalar?: number,
  ) => void;
  showVectorSteps: (kind: 'linePlane' | 'dihedral') => void;
  addVectorReportToScene: () => void;
  undo: () => void;
  redo: () => void;
  loadProject: (project: ProjectFile) => void;
  newProject: () => void;
  setDirty: (dirty: boolean) => void;
  setSaved: (name: string) => void;
}

const DEFAULT_CAMERA: CameraState = {
  target: [0, 0, 1.15],
  yaw: -0.92,
  pitch: 0.42,
  distance: 12.5,
  projection: 'perspective',
  orthoTarget: [0, 0, 1.15],
  orthoZoom: 1,
};

const DEFAULT_SETTINGS: SceneSettings = {
  theme: 'dark',
  showAxes: true,
  showGrid: true,
  showHidden: true,
  linked: true,
  showLabels: true,
  showMeasures: true,
  wireframe: false,
  autoRotate: false,
  autoRotateSpeed: 0.22,
  snap: false,
  gridSize: 20,
};

const cloneEntities = (entities: Entity[]): Entity[] => structuredClone(entities);
const cloneRefs = (refs: SelectionRef[]): SelectionRef[] => structuredClone(refs);

let toastId = 0;
const initialTheme = (() => {
  try {
    const stored = localStorage.getItem('solidgeo-theme');
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  } catch {
    return 'dark';
  }
})();

const initialCamera = (() => {
  try {
    const raw = localStorage.getItem('solidgeo-camera');
    if (raw) return { ...DEFAULT_CAMERA, ...JSON.parse(raw), projection: 'perspective' as const };
  } catch {
    /* ignore */
  }
  return DEFAULT_CAMERA;
})();

export const useApp = create<AppState>((set, get) => {
  const pushHistory = (label: string) => {
    set((state) => ({
      past: [...state.past, { label, entities: cloneEntities(state.entities), selection: cloneRefs(state.selection) }].slice(-80),
      future: [],
    }));
  };

  const applyEntities = (
    label: string,
    newEntities: Entity[],
    selection?: SelectionRef[],
  ) => {
    set((state) => ({
      entities: newEntities,
      selection: selection ?? state.selection,
      past: [
        ...state.past,
        { label, entities: cloneEntities(state.entities), selection: cloneRefs(state.selection) },
      ].slice(-80),
      future: [],
      dirty: true,
    }));
  };

  const findGeoms = (): Geom[] => {
    const state = get();
    return resolveAll(state.selection, state.entities);
  };

  const selectId = (id: string): SelectionRef[] => [{ id }];

  const createFreePoint = (entities: Entity[], pos: Vec3): { entities: Entity[]; point: Entity } => {
    const p = makePoint(entities, pos);
    return { entities: [...entities, p], point: p };
  };

  const cleanupDependents = (entities: Entity[], removed: Set<string>): { entities: Entity[]; removedExtra: number } => {
    let current = entities.filter((e) => !removed.has(e.id));
    let extra = 0;
    let changed = true;
    while (changed) {
      changed = false;
      const next = current.filter((entity) => {
        const anchorBroken = (a: Anchor) =>
          removed.has(a.id) && !current.some((e) => e.id === a.id);
        let broken = false;
        if (entity.type === 'segment' || entity.type === 'line') {
          broken = anchorBroken(entity.a) || anchorBroken(entity.b);
        } else if (entity.type === 'plane' && entity.definition.kind === 'points') {
          broken =
            anchorBroken(entity.definition.a) ||
            anchorBroken(entity.definition.b) ||
            anchorBroken(entity.definition.c);
        } else if (entity.type === 'circle') {
          broken = anchorBroken(entity.center);
        } else if (entity.type === 'vector' && entity.definition.kind === 'anchors') {
          broken = anchorBroken(entity.definition.a) || anchorBroken(entity.definition.b);
        } else if (entity.type === 'section') {
          broken = removed.has(entity.solidId);
          if (entity.plane.kind === 'points') {
            broken =
              broken ||
              anchorBroken(entity.plane.a) ||
              anchorBroken(entity.plane.b) ||
              anchorBroken(entity.plane.c);
          }
        }
        if (broken) {
          removed.add(entity.id);
          changed = true;
          extra += 1;
          return false;
        }
        return true;
      });
      current = next;
    }
    return { entities: current, removedExtra: extra };
  };

  const toolCreateFromAnchor = (anchor: Anchor) => {
    const state = get();
    const anchors = [...state.pendingAnchors, anchor];
    const same = state.pendingAnchors.some((a) => anchorKey(a) === anchorKey(anchor));
    if (same) {
      get().toast('这个点已经在待选列表中', 'warn');
      return;
    }
    const need = state.activeTool === 'plane' ? 3 : 2;
    if (anchors.length < need) {
      set({ pendingAnchors: anchors });
      get().toast(`已选择 ${anchors.length}/${need} 个点`, 'info');
      return;
    }
    if (state.activeTool === 'segment') {
      const seg = makeSegment(state.entities, anchors[0], anchors[1]);
      set({ pendingAnchors: [] });
      get().addEntities([seg], `创建${seg.name}`, selectId(seg.id));
      get().toast('线段已创建，可继续点击两点', 'success');
    } else if (state.activeTool === 'line') {
      const line = makeLine(state.entities, anchors[0], anchors[1]);
      set({ pendingAnchors: [] });
      get().addEntities([line], `创建${line.name}`, selectId(line.id));
      get().toast('直线已创建，可继续点击两点', 'success');
    } else if (state.activeTool === 'plane') {
      const a = resolveAnchor(anchors[0], state.entities);
      const b = resolveAnchor(anchors[1], state.entities);
      const c = resolveAnchor(anchors[2], state.entities);
      if (!a || !b || !c) return;
      const normal = cross(sub(b.pos, a.pos), sub(c.pos, a.pos));
      if (len(normal) < 1e-7) {
        get().toast('三点共线，无法确定平面', 'error');
        set({ pendingAnchors: [] });
        return;
      }
      const plane = makePlane(state.entities, {
        kind: 'points',
        a: anchors[0],
        b: anchors[1],
        c: anchors[2],
      });
      set({ pendingAnchors: [] });
      get().addEntities([plane], `创建${plane.name}`, selectId(plane.id));
      get().toast('平面已创建', 'success');
    }
  };

  return {
    entities: [],
    selection: [],
    selectionMode: 'entity',
    activeTool: 'select',
    pendingAnchors: [],
    activeViewport: 'perspective',
    leftTab: 'create',
    rightTab: 'props',
    settings: { ...DEFAULT_SETTINGS, theme: initialTheme },
    camera: initialCamera,
    docName: '未命名场景',
    dirty: false,
    past: [],
    future: [],
    dragActive: false,
    mouseWorld: null,
    hoverLabel: null,
    dialog: null,
    toasts: [],
    measureReport: null,
    vectorReport: null,
    saving: false,
    lastSavedAt: null,

    setLeftTab: (leftTab) => set({ leftTab }),
    setRightTab: (rightTab) => set({ rightTab }),
    setActiveViewport: (activeViewport) => set({ activeViewport }),
    setActiveTool: (activeTool) => set({ activeTool, pendingAnchors: [] }),
    setSelectionMode: (selectionMode) => set({ selectionMode }),
    setSelection: (selection) => set({ selection }),
    selectRef: (ref, additive) =>
      set((state) => {
        const exists = state.selection.find((s) => s.id === ref.id && JSON.stringify(s.part) === JSON.stringify(ref.part));
        if (additive) {
          return {
            selection: exists
              ? state.selection.filter((s) => !(s.id === ref.id && JSON.stringify(s.part) === JSON.stringify(ref.part)))
              : [...state.selection, ref],
          };
        }
        return { selection: exists && state.selection.length === 1 ? [] : [ref] };
      }),
    clearSelection: () => set({ selection: [], pendingAnchors: [] }),
    setMouseWorld: (mouseWorld) => set({ mouseWorld }),
    setHoverLabel: (hoverLabel) => set({ hoverLabel }),
    setCamera: (camera) => {
      set({ camera });
      try {
        localStorage.setItem('solidgeo-camera', JSON.stringify({ ...camera, projection: 'perspective' }));
      } catch {
        /* ignore */
      }
    },
    setSettings: (patch) =>
      set((state) => {
        const settings = { ...state.settings, ...patch };
        try {
          localStorage.setItem('solidgeo-theme', settings.theme);
        } catch {
          /* ignore */
        }
        return { settings };
      }),
    setDocName: (docName) => set({ docName }),
    setDialog: (dialog) => set({ dialog }),
    toast: (message, tone = 'info') => {
      const id = ++toastId;
      set((state) => ({ toasts: [...state.toasts, { id, message, tone }].slice(-3) }));
      window.setTimeout(() => get().dismissToast(id), 2600);
    },
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    dismissMeasure: () => set({ measureReport: null }),
    dismissVector: () => set({ vectorReport: null }),

    beginDrag: (label = '拖拽顶点') => {
      const state = get();
      if (state.dragActive) return;
      pushHistory(label);
      set({ dragActive: true });
    },
    endDrag: () => set({ dragActive: false }),
    recordSnapshot: (label) => pushHistory(label),

    moveAnchor: (anchor, pos, record = false) => {
      if (record) pushHistory('移动顶点');
      set((state) => ({
        entities: state.entities.map((entity) => {
          if (anchor.kind === 'point' && entity.id === anchor.id && entity.type === 'point') {
            return { ...entity, pos: [...pos] as Vec3 };
          }
          if (anchor.kind === 'solidVertex' && entity.id === anchor.id && entity.type === 'solid' && anchor.index != null) {
            const vertices = entity.vertices.map((p, i) => (i === anchor.index ? ([...pos] as Vec3) : p));
            return { ...entity, vertices, deformed: true };
          }
          return entity;
        }),
        dirty: true,
      }));
    },
    updatePointPosition: (id, pos, record = true) => {
      if (record) pushHistory('修改点坐标');
      set((state) => ({
        entities: state.entities.map((e) => (e.id === id && e.type === 'point' ? { ...e, pos: [...pos] as Vec3 } : e)),
        dirty: true,
      }));
    },
    updateEntity: (id, updater, label = '编辑图元') => {
      pushHistory(label);
      set((state) => ({
        entities: state.entities.map((e) => (e.id === id ? updater(e) : e)),
        dirty: true,
      }));
    },
    renameEntity: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      pushHistory('重命名');
      set((state) => ({
        entities: state.entities.map((e) => (e.id === id ? { ...e, name: trimmed } : e)),
        dirty: true,
      }));
    },
    regenerateSolid: (id, params) => {
      const state = get();
      const solid = state.entities.find((e) => e.id === id && e.type === 'solid');
      if (!solid || solid.type !== 'solid') return;
      const build = buildSolid(solid.solidType, { ...solid.params, ...params });
      if (!build.vertices.length) return;
      const sameCount = build.vertices.length === solid.vertices.length;
      const labelIndices = build.labelIndices ?? build.vertices.map((_, i) => i);
      const oldNames = solid.vertexNames;
      const freshNames = allocateNames(state.entities, labelIndices.length);
      const vertexNames = build.vertices.map((_, i) => {
        const labelSlot = labelIndices.indexOf(i);
        if (labelSlot < 0) return '';
        if (sameCount && oldNames[i]) return oldNames[i];
        return freshNames[labelSlot] ?? '';
      });
      const updated: SolidEntity = {
        ...solid,
        params: build.params,
        vertices: build.vertices,
        faces: build.faces,
        edges: build.edges,
        vertexNames,
        labelIndices,
        deformed: false,
      };
      pushHistory('调整几何体参数');
      set((s) => ({
        entities: s.entities.map((e) => (e.id === id ? updated : e)),
        dirty: true,
      }));
      get().toast('几何体参数已更新', 'success');
    },
    updateCircleParams: (id, patch) => {
      pushHistory('修改圆参数');
      set((state) => ({
        entities: state.entities.map((e) => {
          if (e.id !== id || e.type !== 'circle') return e;
          return {
            ...e,
            radius: Math.max(0.01, patch.radius ?? e.radius),
            sweep: clamp(patch.sweep ?? e.sweep, -Math.PI * 4, Math.PI * 4),
            normal: patch.normal ? norm(patch.normal) : e.normal,
          };
        }),
        dirty: true,
      }));
    },
    setSolidOpacity: (id, opacity) => {
      set((state) => ({
        entities: state.entities.map((e) => (e.id === id && e.type === 'solid' ? { ...e, opacity: clamp(opacity, 0.02, 0.9) } : e)),
        dirty: true,
      }));
    },
    toggleVisibility: (id) => {
      pushHistory('切换显示');
      set((state) => ({
        entities: state.entities.map((e) => (e.id === id ? { ...e, visible: !e.visible } : e)),
        dirty: true,
      }));
    },
    deleteSelected: () => {
      const state = get();
      if (!state.selection.length) return;
      if (state.selection.some((s) => s.part)) {
        get().toast('当前选中的是子对象；请切换到「整体」选择后删除实体', 'warn');
        return;
      }
      get().deleteByIds(state.selection.map((s) => s.id));
    },
    deleteByIds: (ids) => {
      const state = get();
      if (!ids.length) return;
      const removed = new Set(ids);
      const cleaned = cleanupDependents(state.entities, removed);
      pushHistory('删除图元');
      set({
        entities: cleaned.entities,
        selection: [],
        dirty: true,
      });
      if (cleaned.removedExtra > 0) {
        get().toast(`已删除 ${ids.length + cleaned.removedExtra} 个图元（含关联图元）`, 'success');
      } else {
        get().toast('已删除选中图元', 'success');
      }
    },
    clearScene: () => {
      if (!get().entities.length) return;
      pushHistory('清空场景');
      set({ entities: [], selection: [], pendingAnchors: [], dirty: true, measureReport: null, vectorReport: null });
      get().toast('场景已清空，可使用 Ctrl+Z 撤销', 'info');
    },

    addEntities: (newEntities, label, selection) => {
      if (!newEntities.length) return;
      applyEntities(label, [...get().entities, ...newEntities], selection ?? get().selection);
    },

    handleCanvasPick: (pick, world, additive) => {
      const state = get();
      if (state.activeTool === 'point') {
        get().createPointAt(world);
        return;
      }
      if (state.activeTool === 'segment' || state.activeTool === 'line' || state.activeTool === 'plane') {
        let anchor = pick ? anchorForSelection(pick, state.entities) : null;
        if (!anchor) {
          const created = createFreePoint(state.entities, world);
          set({ entities: created.entities, dirty: true });
          anchor = { kind: 'point', id: created.point.id };
          get().toast(`已创建点 ${created.point.name}`, 'success');
        }
        toolCreateFromAnchor(anchor);
        return;
      }
      if (!pick) {
        if (!additive) set({ selection: [] });
        return;
      }
      get().selectRef(pick, additive);
    },

    createPointAt: (pos) => {
      const state = get();
      const point = makePoint(state.entities, pos);
      applyEntities(`创建${point.name}`, [...state.entities, point], selectId(point.id));
      get().toast(`点 ${point.name} 已创建`, 'success');
    },

    createSolid: (solidType, params) => {
      const state = get();
      const solid = makeSolid(state.entities, solidType, params);
      applyEntities(`创建${solid.name}`, [...state.entities, solid], selectId(solid.id));
      get().toast(`${SOLID_NAMES[solidType]} ${solid.name} 已创建`, 'success');
    },

    createCircle: ({ center, normal, radius, sweepDeg, startAngleDeg }) => {
      const state = get();
      const selectedAnchor = state.selection
        .map((r) => anchorForSelection(r, state.entities))
        .find((a): a is Anchor => Boolean(a));
      let entities = state.entities;
      let anchor = selectedAnchor;
      if (!anchor) {
        const created = createFreePoint(entities, center);
        entities = created.entities;
        anchor = { kind: 'point', id: created.point.id };
      }
      const circle = makeCircle(
        entities,
        anchor,
        norm(normal),
        Math.max(0.01, radius),
        (clamp(sweepDeg, -1440, 1440) * Math.PI) / 180,
        (startAngleDeg * Math.PI) / 180,
      );
      applyEntities(`创建${circle.name}`, [...entities, circle], selectId(circle.id));
      get().toast('圆 / 圆弧已创建', 'success');
    },

    createVector: (origin, value) => {
      const state = get();
      if (len(value) < 1e-8) {
        get().toast('向量不能为零向量', 'warn');
        return;
      }
      const vector = makeVector(state.entities, { kind: 'free', origin, value });
      applyEntities(`创建${vector.name}`, [...state.entities, vector], selectId(vector.id));
      get().toast('向量已创建', 'success');
    },

    createVectorFromSelection: () => {
      const state = get();
      const geoms = findGeoms();
      const points = geoms.filter((g) => g.kind === 'point');
      if (points.length === 2) {
        const a = anchorForSelection(points[0].ref, state.entities);
        const b = anchorForSelection(points[1].ref, state.entities);
        if (a && b) {
          const vector = makeVector(state.entities, { kind: 'anchors', a, b });
          applyEntities('两点生成向量', [...state.entities, vector], selectId(vector.id));
          get().toast('已由两点创建向量', 'success');
          return;
        }
      }
      set({ dialog: { kind: 'vector' } });
    },

    constructMidpoint: () => {
      const state = get();
      const geoms = findGeoms();
      const points = geoms.filter((g) => g.kind === 'point');
      const line = geoms.find((g) => g.kind === 'line');
      let pos: Vec3 | null = null;
      if (points.length >= 2) pos = mul(add(points[0].pos, points[1].pos), 0.5);
      else if (line) pos = mul(add(line.a, line.b), 0.5);
      if (!pos) {
        get().toast('请选择两个点或一条线段', 'warn');
        return;
      }
      const point = makePoint(state.entities, pos);
      applyEntities('构造中点', [...state.entities, point], selectId(point.id));
      get().toast(`中点 ${point.name} 已构造`, 'success');
    },

    constructIntersection: () => {
      const state = get();
      const geoms = findGeoms();
      const lines = geoms.filter((g) => g.kind === 'line');
      const planes = geoms.filter((g) => g.kind === 'plane' || g.kind === 'face');
      const solids = geoms.filter((g) => g.kind === 'solid');
      if (lines.length >= 2) {
        const closest = lineLineClosest(lines[0].a, lines[0].dir, lines[1].b, lines[1].dir);
        if (closest.parallel) {
          get().toast('两条直线平行或重合，没有唯一交点', 'warn');
          return;
        }
        if (closest.distance > 1e-5) {
          get().toast('两条直线异面，没有交点', 'warn');
          return;
        }
        const point = makePoint(state.entities, closest.a);
        applyEntities('构造交点', [...state.entities, point], selectId(point.id));
        get().toast(`交点 ${point.name} 已构造`, 'success');
        return;
      }
      if (lines.length >= 1 && planes.length >= 1) {
        const p = planes[0].kind === 'plane' ? planes[0].point : planes[0].centroid;
        const n = planes[0].kind === 'plane' ? planes[0].normal : planes[0].normal;
        const hit = linePlaneIntersection(lines[0].a, lines[0].dir, p, n);
        if (!hit) {
          get().toast('直线与平面平行，没有交点', 'warn');
          return;
        }
        const point = makePoint(state.entities, hit);
        applyEntities('构造线面交点', [...state.entities, point], selectId(point.id));
        get().toast(`线面交点 ${point.name} 已构造`, 'success');
        return;
      }
      if (planes.length >= 2) {
        const pa = planes[0].kind === 'plane' ? planes[0].point : planes[0].centroid;
        const na = planes[0].kind === 'plane' ? planes[0].normal : planes[0].normal;
        const pb = planes[1].kind === 'plane' ? planes[1].point : planes[1].centroid;
        const nb = planes[1].kind === 'plane' ? planes[1].normal : planes[1].normal;
        const inter = planePlaneIntersection(pa, na, pb, nb);
        if (!inter) {
          get().toast('两个平面平行或重合，没有交线', 'warn');
          return;
        }
        const p1 = add(inter.point, mul(inter.dir, -1.5));
        const p2 = add(inter.point, mul(inter.dir, 1.5));
        const a = makePoint(state.entities, p1);
        const b = makePoint([...state.entities, a], p2);
        const line = makeLine([...state.entities, a, b], { kind: 'point', id: a.id }, { kind: 'point', id: b.id });
        applyEntities('构造平面交线', [...state.entities, a, b, line], selectId(line.id));
        get().toast('两平面交线已构造', 'success');
        return;
      }
      if (solids.length >= 1 && planes.length >= 1) {
        get().toast('已选中立体与平面，正在生成截面…', 'info');
        set({ dialog: { kind: 'section', solidId: solids[0].solid.id } });
        return;
      }
      get().toast('交点工具支持：两直线、线面、两平面、立体与平面', 'warn');
    },

    constructFoot: () => {
      const state = get();
      const geoms = findGeoms();
      const point = geoms.find((g) => g.kind === 'point');
      const line = geoms.find((g) => g.kind === 'line');
      const plane = geoms.find((g) => g.kind === 'plane' || g.kind === 'face');
      if (point && line) {
        const t = dot(sub(point.pos, line.a), line.dir) / Math.max(1e-9, dot(line.dir, line.dir));
        const foot = add(line.a, mul(line.dir, t));
        const p = makePoint(state.entities, foot);
        applyEntities('构造垂足', [...state.entities, p], selectId(p.id));
        get().toast(`垂足 ${p.name} 已构造`, 'success');
        return;
      }
      if (point && plane) {
        const pt = plane.kind === 'plane' ? plane.point : plane.centroid;
        const n = plane.kind === 'plane' ? plane.normal : plane.normal;
        const foot = sub(point.pos, mul(n, dot(sub(point.pos, pt), n)));
        const p = makePoint(state.entities, foot);
        applyEntities('构造垂足', [...state.entities, p], selectId(p.id));
        get().toast(`平面垂足 ${p.name} 已构造`, 'success');
        return;
      }
      get().toast('请选择一个点和一条直线/一个平面', 'warn');
    },

    constructProjection: () => get().constructFoot(),

    constructPlaneThree: () => {
      const state = get();
      const geoms = findGeoms();
      const points = geoms.filter((g) => g.kind === 'point');
      if (points.length !== 3) {
        get().toast('请选择恰好三个点来建立平面', 'warn');
        return;
      }
      const anchors = points.map((p) => anchorForSelection(p.ref, state.entities));
      if (anchors.some((a) => !a)) {
        get().toast('三点必须来自可引用的顶点', 'warn');
        return;
      }
      const [a, b, c] = anchors as Anchor[];
      if (
        len(cross(
          sub(resolveAnchor(b, state.entities)!.pos, resolveAnchor(a, state.entities)!.pos),
          sub(resolveAnchor(c, state.entities)!.pos, resolveAnchor(a, state.entities)!.pos),
        )) < 1e-7
      ) {
        get().toast('三点共线，无法建立平面', 'error');
        return;
      }
      const plane = makePlane(state.entities, { kind: 'points', a, b, c });
      applyEntities('过三点建面', [...state.entities, plane], selectId(plane.id));
      get().toast('平面已建立', 'success');
    },

    constructPlaneLinePoint: () => {
      const state = get();
      const geoms = findGeoms();
      const lineGeom = geoms.find((g) => g.kind === 'line');
      const pointGeom = geoms.find((g) => g.kind === 'point');
      if (!lineGeom || !pointGeom) {
        get().toast('请选择一条直线/线段和一个点', 'warn');
        return;
      }
      const entity = lineGeom.entity;
      if (entity.type !== 'segment' && entity.type !== 'line') {
        get().toast('该直线没有可引用的定义点', 'warn');
        return;
      }
      const pa = anchorForSelection(pointGeom.ref, state.entities);
      if (!pa) {
        get().toast('该点没有可引用的顶点', 'warn');
        return;
      }
      const p = resolveAnchor(pa, state.entities)!.pos;
      const a = resolveAnchor(entity.a, state.entities);
      const b = resolveAnchor(entity.b, state.entities);
      if (!a || !b) return;
      if (len(cross(sub(b.pos, a.pos), sub(p, a.pos))) < 1e-7) {
        get().toast('点位于直线上，无法唯一确定平面', 'error');
        return;
      }
      const plane = makePlane(state.entities, {
        kind: 'points',
        a: entity.a,
        b: entity.b,
        c: pa,
      });
      applyEntities('过线点建面', [...state.entities, plane], selectId(plane.id));
      get().toast('平面已建立', 'success');
    },

    prepareExtrude: () => {
      const state = get();
      const geoms = findGeoms();
      const face = geoms.find((g) => g.kind === 'face');
      const points = geoms.filter((g) => g.kind === 'point');
      let polygon: Vec3[] | null = null;
      let normal: Vec3 | null = null;
      if (face && face.kind === 'face') {
        polygon = face.points;
        normal = face.normal;
      } else if (points.length === 3) {
        polygon = points.map((p) => p.pos);
        normal = cross(sub(points[1].pos, points[0].pos), sub(points[2].pos, points[0].pos));
      } else {
        const plane = geoms.find((g) => g.kind === 'plane');
        if (plane) {
          const def = plane.entity.type === 'plane' ? plane.entity.definition : null;
          if (def && def.kind === 'points') {
            const a = resolveAnchor(def.a, state.entities);
            const b = resolveAnchor(def.b, state.entities);
            const c = resolveAnchor(def.c, state.entities);
            if (a && b && c) {
              polygon = [a.pos, b.pos, c.pos];
              normal = plane.normal;
            }
          }
        }
      }
      if (!polygon || !normal || len(normal) < 1e-7) {
        get().toast('请选择一个实体面、三点或三点确定的平面', 'warn');
        return;
      }
      set({ dialog: { kind: 'extrude', points: polygon, normal: norm(normal) } });
    },

    createExtrude: (height) => {
      const state = get();
      if (state.dialog?.kind !== 'extrude') return;
      const { points, normal } = state.dialog;
      try {
        const solid = makeExtrudedSolid(state.entities, points, normal, height);
        applyEntities('拉伸构体', [...state.entities, solid], selectId(solid.id));
        set({ dialog: null });
        get().toast(`${solid.name} 已生成`, 'success');
      } catch (error) {
        get().toast(error instanceof Error ? error.message : '拉伸失败', 'error');
      }
    },

    openSection: () => {
      const state = get();
      const geoms = findGeoms();
      const solid = geoms.find((g) => g.kind === 'solid');
      const plane = geoms.find((g) => g.kind === 'plane');
      if (!solid) {
        get().toast('请先选择一个立体', 'warn');
        return;
      }
      if (plane && plane.entity.type === 'plane') {
        get().createSection(solid.solid.id, plane.entity.id);
        return;
      }
      set({ dialog: { kind: 'section', solidId: solid.solid.id } });
    },

    createSection: (solidId, planeId, options = {}) => {
      const state = get();
      const solid = state.entities.find((e) => e.id === solidId);
      const plane = state.entities.find((e) => e.id === planeId);
      if (!solid || solid.type !== 'solid' || !plane || plane.type !== 'plane') {
        get().toast('截面需要有效的立体与平面', 'warn');
        return;
      }
      const def = plane.definition;
      const section = makeSection(state.entities, solidId, structuredClone(def), {
        clip: options.clip,
        fill: options.fill,
      });
      applyEntities(`生成${section.name}`, [...state.entities, section], selectId(section.id));
      set({ dialog: null, rightTab: 'props' });
      get().toast('截面已生成，可在属性面板中切换剖切显示', 'success');
    },

    createAxisSection: (solidId, axis, offset) => {
      const state = get();
      const solid = state.entities.find((e) => e.id === solidId);
      if (!solid || solid.type !== 'solid') return;
      const normal: Vec3 = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const point: Vec3 = axis === 'x' ? [offset, 0, 0] : axis === 'y' ? [0, offset, 0] : [0, 0, offset];
      const plane: PlaneDef = { kind: 'free', point, normal };
      const section = makeSection(state.entities, solidId, plane, { clip: false, fill: true });
      applyEntities(`生成${section.name}`, [...state.entities, section], selectId(section.id));
      set({ dialog: null });
      get().toast('轴向截面已生成', 'success');
    },

    measure: (kind) => {
      const state = get();
      if (!state.selection.length) {
        get().toast('请先选择要度量的图元', 'warn');
        return;
      }
      const items = runMeasure(kind, state.selection, state.entities);
      if (!items.length) {
        get().toast('当前选择不支持该度量，请检查选择类型', 'warn');
        return;
      }
      const names: Record<MeasureKind, string> = {
        length: '长度度量',
        angle: '角度度量',
        linePlaneAngle: '线面角',
        dihedral: '二面角',
        skewAngle: '异面直线角',
        pointPlaneDistance: '点到平面距离',
        surfaceArea: '表面积',
        volume: '体积',
      };
      set({
        measureReport: {
          title: names[kind],
          items,
          selection: selectionRelations(state.selection, state.entities).map((r) => r.label).join(' · '),
        },
        rightTab: 'measure',
      });
      get().toast(`${names[kind]}计算完成`, 'success');
    },

    measureSelection: () => {
      const state = get();
      if (!state.selection.length) return;
      const items = selectionMetrics(state.selection, state.entities);
      const relations = selectionRelations(state.selection, state.entities);
      set({
        measureReport: {
          title: '选中图元度量',
          items,
          selection: relations.map((r) => r.label).join(' · '),
        },
        rightTab: 'measure',
      });
    },

    vectorOp: (op, scalar) => {
      const state = get();
      const geoms = findGeoms();
      const vectors = geoms.filter((g) => g.kind === 'vector');
      if (op === 'magnitude') {
        if (vectors.length !== 1) {
          get().toast('模长计算需要一个向量', 'warn');
          return;
        }
        const v = vectors[0];
        set({
          vectorReport: {
            title: '向量模长与方向余弦',
            steps: [
              `a = ${fmtVec(v.value, 4)}`,
              `|a| = √(${fmt(v.value[0], 3)}² + ${fmt(v.value[1], 3)}² + ${fmt(v.value[2], 3)}²) = ${fmt(len(v.value), 4)}`,
              `单位向量 a/|a| = ${fmtVec(directionCosines(v.value), 4)}`,
              `方向余弦 (cos α, cos β, cos γ) = ${fmtVec(directionCosines(v.value), 4)}`,
            ],
            result: `|a| = ${fmt(len(v.value), 4)}`,
            scalarValue: len(v.value),
            origin: v.origin,
          },
          rightTab: 'vector',
        });
        return;
      }
      if (op === 'angle') {
        if (vectors.length < 2) {
          get().toast('夹角计算需要选择两个向量', 'warn');
          return;
        }
        const a = vectors[0];
        const b = vectors[1];
        const cosv = dot(a.value, b.value) / Math.max(1e-9, len(a.value) * len(b.value));
        const ang = angleDeg(a.value, b.value);
        set({
          vectorReport: {
            title: '两向量夹角',
            steps: [
              `a = ${fmtVec(a.value, 4)}，b = ${fmtVec(b.value, 4)}`,
              `a·b = ${fmt(dot(a.value, b.value), 4)}`,
              `|a||b| = ${fmt(len(a.value) * len(b.value), 4)}`,
              `cos θ = ${fmt(cosv, 4)}`,
              `θ = arccos(${fmt(cosv, 4)}) = ${fmt(ang, 3)}°`,
            ],
            result: `θ = ${fmt(ang, 3)}°`,
            scalarValue: ang,
            origin: a.origin,
          },
          rightTab: 'vector',
        });
        return;
      }
      if (op === 'scalar') {
        if (vectors.length !== 1) {
          get().toast('数乘需要一个向量', 'warn');
          return;
        }
        const v = vectors[0];
        const k = scalar ?? 2;
        const value = mul(v.value, k);
        set({
          vectorReport: {
            title: `数乘 ${fmt(k, 2)}a`,
            steps: [
              `a = ${fmtVec(v.value, 4)}`,
              `λ = ${fmt(k, 3)}`,
              `λa = (${fmt(k * v.value[0], 4)}, ${fmt(k * v.value[1], 4)}, ${fmt(k * v.value[2], 4)})`,
            ],
            result: `${fmt(k, 2)}a = ${fmtVec(value, 4)}，模长 ${fmt(len(value), 4)}`,
            resultValue: value,
            origin: v.origin,
          },
          rightTab: 'vector',
        });
        return;
      }
      if (vectors.length < 2) {
        get().toast('该运算需要选择两个向量（可按住 Ctrl 多选）', 'warn');
        return;
      }
      const a = vectors[0];
      const b = vectors[1];
      if (op === 'add' || op === 'sub') {
        const value = op === 'add' ? add(a.value, b.value) : sub(a.value, b.value);
        set({
          vectorReport: {
            title: op === 'add' ? '向量加法 a + b' : '向量减法 a − b',
            steps: [
              `a = ${fmtVec(a.value, 4)}`,
              `b = ${fmtVec(b.value, 4)}`,
              `a ${op === 'add' ? '+' : '−'} b = ${fmtVec(value, 4)}`,
              `|a ${op === 'add' ? '+' : '−'} b| = ${fmt(len(value), 4)}`,
            ],
            result: `${fmtVec(value, 4)}，模长 ${fmt(len(value), 4)}`,
            resultValue: value,
            origin: a.origin,
          },
          rightTab: 'vector',
        });
        return;
      }
      if (op === 'dot') {
        const value = dot(a.value, b.value);
        const ang = angleDeg(a.value, b.value);
        set({
          vectorReport: {
            title: '向量点积 a · b',
            steps: [
              `a = ${fmtVec(a.value, 4)}`,
              `b = ${fmtVec(b.value, 4)}`,
              `a · b = ${fmt(a.value[0], 3)}×${fmt(b.value[0], 3)} + ${fmt(a.value[1], 3)}×${fmt(b.value[1], 3)} + ${fmt(a.value[2], 3)}×${fmt(b.value[2], 3)}`,
              `a · b = ${fmt(value, 4)}`,
              `cos θ = (a·b)/(|a||b|) = ${fmt(value / Math.max(1e-9, len(a.value) * len(b.value)), 4)}`,
            ],
            result: `a · b = ${fmt(value, 4)}，夹角 ${fmt(ang, 3)}°`,
            scalarValue: value,
            origin: a.origin,
          },
          rightTab: 'vector',
        });
        return;
      }
      if (op === 'cross') {
        const value = cross(a.value, b.value);
        set({
          vectorReport: {
            title: '向量叉积 a × b',
            steps: [
              `a = ${fmtVec(a.value, 4)}`,
              `b = ${fmtVec(b.value, 4)}`,
              `a × b = ${fmtVec(value, 4)}`,
              `|a × b| = ${fmt(len(value), 4)}`,
              `方向与 a、b 均垂直（右手定则）`,
            ],
            result: `${fmtVec(value, 4)}，模长 ${fmt(len(value), 4)}`,
            resultValue: value,
            origin: a.origin,
          },
          rightTab: 'vector',
        });
        return;
      }
      if (op === 'unit') {
        const u = directionCosines(a.value);
        set({
          vectorReport: {
            title: '单位向量与方向余弦',
            steps: [
              `a = ${fmtVec(a.value, 4)}，|a| = ${fmt(len(a.value), 4)}`,
              `a / |a| = ${fmtVec(u, 4)}`,
              `cos α = ${fmt(u[0], 4)}，cos β = ${fmt(u[1], 4)}，cos γ = ${fmt(u[2], 4)}`,
            ],
            result: `单位向量 ${fmtVec(u, 4)}`,
            resultValue: u,
            origin: a.origin,
          },
          rightTab: 'vector',
        });
        return;
      }
      if (op === 'projection') {
        const proj = projectionVector(a.value, b.value);
        set({
          vectorReport: {
            title: '向量投影',
            steps: [
              `a = ${fmtVec(a.value, 4)}，b = ${fmtVec(b.value, 4)}`,
              `a·b = ${fmt(dot(a.value, b.value), 4)}，|b|² = ${fmt(dot(b.value, b.value), 4)}`,
              `proj_b a = (a·b / |b|²) b = ${fmtVec(proj, 4)}`,
            ],
            result: `a 在 b 上的投影向量 ${fmtVec(proj, 4)}，投影长度 ${fmt(len(proj), 4)}`,
            resultValue: proj,
            origin: b.origin,
          },
          rightTab: 'vector',
        });
      }
    },

    showVectorSteps: (kind) => {
      const state = get();
      const steps =
        kind === 'linePlane'
          ? vectorStepsForLinePlane(state.selection, state.entities)
          : vectorStepsForDihedral(state.selection, state.entities);
      if (!steps) {
        get().toast(
          kind === 'linePlane' ? '请选择一个线状图元和一个平面' : '请选择两个平面或面',
          'warn',
        );
        return;
      }
      set({
        vectorReport: {
          title: steps.title,
          steps: steps.steps,
          result: steps.result,
          scalarValue: steps.value,
        },
        rightTab: 'vector',
      });
      get().toast('向量法步骤已生成', 'success');
    },

    addVectorReportToScene: () => {
      const state = get();
      const report = state.vectorReport;
      if (!report?.resultValue) {
        get().toast('当前结果不是向量，无法加入场景', 'warn');
        return;
      }
      const vector = makeVector(state.entities, {
        kind: 'free',
        origin: report.origin ?? [0, 0, 0],
        value: report.resultValue,
      });
      applyEntities('向量结果加入场景', [...state.entities, vector], selectId(vector.id));
      get().toast('结果向量已加入场景', 'success');
    },

    undo: () => {
      const state = get();
      if (!state.past.length) {
        get().toast('没有可撤销的操作', 'info');
        return;
      }
      const entry = state.past[state.past.length - 1];
      set({
        entities: cloneEntities(entry.entities),
        selection: cloneRefs(entry.selection),
        past: state.past.slice(0, -1),
        future: [
          { label: entry.label, entities: cloneEntities(state.entities), selection: cloneRefs(state.selection) },
          ...state.future,
        ].slice(0, 80),
        dirty: true,
        dragActive: false,
      });
      get().toast(`已撤销：${entry.label}`, 'info');
    },

    redo: () => {
      const state = get();
      if (!state.future.length) {
        get().toast('没有可重做的操作', 'info');
        return;
      }
      const entry = state.future[0];
      set({
        entities: cloneEntities(entry.entities),
        selection: cloneRefs(entry.selection),
        past: [
          ...state.past,
          { label: entry.label, entities: cloneEntities(state.entities), selection: cloneRefs(state.selection) },
        ].slice(-80),
        future: state.future.slice(1),
        dirty: true,
        dragActive: false,
      });
      get().toast(`已重做：${entry.label}`, 'info');
    },

    loadProject: (project) => {
      set({
        entities: structuredClone(project.entities ?? []),
        selection: [],
        settings: { ...DEFAULT_SETTINGS, ...project.settings },
        camera: { ...DEFAULT_CAMERA, ...project.camera, projection: 'perspective' },
        docName: project.name || '未命名场景',
        dirty: false,
        past: [],
        future: [],
        activeTool: 'select',
        pendingAnchors: [],
        measureReport: null,
        vectorReport: null,
        dialog: null,
      });
      get().toast('工程文件已打开', 'success');
    },

    newProject: () => {
      set((state) => ({
        entities: [],
        selection: [],
        pendingAnchors: [],
        docName: '未命名场景',
        dirty: false,
        past: [],
        future: [],
        activeTool: 'select',
        measureReport: null,
        vectorReport: null,
        dialog: null,
        camera: { ...DEFAULT_CAMERA },
        settings: { ...state.settings, autoRotate: false },
      }));
      get().toast('已新建空场景', 'info');
    },

    setDirty: (dirty) => set({ dirty }),
    setSaved: (name) => set({ dirty: false, docName: name, lastSavedAt: new Date().toISOString() }),
  };
});

export function makeProjectFile(state: AppState): ProjectFile {
  return {
    format: 'solidgeo',
    schemaVersion: 2,
    appVersion: '1.0.0',
    name: state.docName,
    savedAt: new Date().toISOString(),
    entities: structuredClone(state.entities),
    camera: structuredClone(state.camera),
    settings: structuredClone(state.settings),
  };
}

export function defaultSettings(): SceneSettings {
  return { ...DEFAULT_SETTINGS };
}

export function defaultCamera(): CameraState {
  return { ...DEFAULT_CAMERA };
}
