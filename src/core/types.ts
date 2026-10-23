export type Vec3 = [number, number, number];

export type ViewportId = 'perspective' | 'front' | 'top' | 'left';

export type ToolMode =
  | 'select'
  | 'point'
  | 'segment'
  | 'line'
  | 'plane';

export interface SelectionRef {
  id: string;
  part?:
    | { kind: 'vertex'; index: number }
    | { kind: 'face'; index: number }
    | { kind: 'edge'; index: number };
}

export interface Anchor {
  kind: 'point' | 'solidVertex';
  id: string;
  index?: number;
}

export type PlaneDef =
  | { kind: 'points'; a: Anchor; b: Anchor; c: Anchor }
  | { kind: 'free'; point: Vec3; normal: Vec3 };

export interface EntityBase {
  id: string;
  type: string;
  name: string;
  visible: boolean;
  color: string;
  locked?: boolean;
  createdAt: number;
}

export interface PointEntity extends EntityBase {
  type: 'point';
  pos: Vec3;
}

export interface SegmentEntity extends EntityBase {
  type: 'segment';
  a: Anchor;
  b: Anchor;
}

export interface LineEntity extends EntityBase {
  type: 'line';
  a: Anchor;
  b: Anchor;
}

export interface PlaneEntity extends EntityBase {
  type: 'plane';
  definition: PlaneDef;
  size: number;
}

export interface CircleEntity extends EntityBase {
  type: 'circle';
  center: Anchor;
  normal: Vec3;
  radius: number;
  sweep: number;
  startAngle: number;
}

export type VectorDef =
  | { kind: 'anchors'; a: Anchor; b: Anchor }
  | { kind: 'free'; origin: Vec3; value: Vec3 };

export interface VectorEntity extends EntityBase {
  type: 'vector';
  definition: VectorDef;
  label?: string;
}

export type SolidType =
  | 'cube'
  | 'cuboid'
  | 'prism'
  | 'pyramid'
  | 'cylinder'
  | 'cone'
  | 'sphere'
  | 'tetra'
  | 'extrude';

export interface SolidEntity extends EntityBase {
  type: 'solid';
  solidType: SolidType;
  params: Record<string, number>;
  vertices: Vec3[];
  faces: number[][];
  edges: [number, number][];
  vertexNames: string[];
  labelIndices?: number[];
  deformed: boolean;
  opacity: number;
}

export interface SectionEntity extends EntityBase {
  type: 'section';
  solidId: string;
  plane: PlaneDef;
  clip: boolean;
  fill: boolean;
  area?: number;
}

export interface TrailEntity extends EntityBase {
  type: 'trail';
  points: Vec3[];
}

export type Entity =
  | PointEntity
  | SegmentEntity
  | LineEntity
  | PlaneEntity
  | CircleEntity
  | VectorEntity
  | SolidEntity
  | SectionEntity
  | TrailEntity;

export type EntityType = Entity['type'];

export interface CameraState {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
  projection: 'perspective' | 'orthographic';
  orthoTarget: Vec3;
  orthoZoom: number;
}

export interface SceneSettings {
  theme: 'dark' | 'light';
  showAxes: boolean;
  showGrid: boolean;
  showHidden: boolean;
  linked: boolean;
  showLabels: boolean;
  showMeasures: boolean;
  wireframe: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  snap: boolean;
  gridSize: number;
}

export interface ProjectFile {
  format: 'solidgeo';
  schemaVersion: number;
  appVersion: string;
  name: string;
  savedAt: string;
  entities: Entity[];
  camera: CameraState;
  settings: SceneSettings;
}

export interface ResolvedPlane {
  point: Vec3;
  normal: Vec3;
  definition: PlaneDef;
}

export interface ResolvedVector {
  origin: Vec3;
  value: Vec3;
  magnitude: number;
}

export interface Polygon3D {
  points: Vec3[];
  normal: Vec3;
  area: number;
  centroid: Vec3;
}

export interface MeasurementItem {
  label: string;
  value: string;
  numeric?: number;
  unit?: string;
  detail?: string;
}

export interface RelationItem {
  kind: 'parallel' | 'perpendicular' | 'intersect' | 'skew' | 'collinear' | 'coplanar' | 'contain' | 'coincident' | 'unknown' | 'equal' | 'concentric';
  label: string;
  detail?: string;
  between: string;
}

export interface VectorSteps {
  title: string;
  steps: string[];
  result: string;
  value?: number;
}
