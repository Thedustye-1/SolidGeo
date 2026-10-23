import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Box,
  Check,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Focus,
  Info,
  Layers,
  Minus,
  MoveRight,
  Play,
  Plus,
  Ruler,
  Scissors,
  Sigma,
  Slash,
  Sparkles,
  Square,
  Trash2,
  Triangle,
  X,
  Pause,
  RotateCw,
  ScanLine,
  Timer,
} from 'lucide-react';
import type {
  CircleEntity,
  Entity,
  PlaneEntity,
  PointEntity,
  SectionEntity,
  SegmentEntity,
  SelectionRef,
  SolidEntity,
  SolidType,
  VectorEntity,
} from '../core/types';
import {
  fmt,
  fmtVec,
  dist,
  len,
  norm,
  dot,
  directionCosines,
  add,
  mul,
  polygonArea,
  polygonPerimeter,
  sub,
} from '../core/math';
import {
  entityDisplayType,
  makePlane,
  resolveAnchor,
  resolveCircle,
  resolvePlane,
  resolveSegment,
  resolveVector,
  sectionArea,
  sectionPolygons,
  solidMetrics,
} from '../core/entities';
import {
  resolveAll,
  selectedVectorsInfo,
  selectionLabel,
  selectionMetrics,
  selectionRelations,
} from '../core/analysis';
import { useApp, type RightTab } from '../store/useApp';
import { getViewportController } from '../render/viewportController';
import { exportSectionFile } from '../lib/sceneActions';
import {
  EmptyHint,
  FieldRow,
  IconButton,
  NumberField,
  SectionLabel,
  Switch,
  TextField,
} from './common';

function tabButton(tab: RightTab, current: RightTab, setter: (t: RightTab) => void, label: string, count?: number) {
  return (
    <button type="button" className={`panel-tab ${tab === current ? 'is-active' : ''}`} onClick={() => setter(tab)}>
      {label}
      {count != null && count > 0 ? <span className="tab-count">{count}</span> : null}
    </button>
  );
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
  useApp.getState().toast(`已复制：${text}`, 'success');
}

function EntityHeading({ entity, label }: { entity: Entity; label: string }) {
  const toggleVisibility = useApp((s) => s.toggleVisibility);
  const [name, setName] = useState(selectionLabel({ id: entity.id }, useApp.getState().entities));
  const isPart = label !== entity.name;
  useEffect(() => setName(isPart ? label : entity.name), [entity.id, entity.name, label, isPart]);
  return (
    <div className="entity-heading">
      <span className="entity-swatch" style={{ background: entity.color }} />
      <div className="entity-heading-copy">
        {isPart ? (
          <div className="entity-name-static">{label}</div>
        ) : (
          <input
            className="entity-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name !== entity.name) useApp.getState().renameEntity(entity.id, name.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            aria-label="图元名称"
          />
        )}
        <div className="entity-subline">
          <span>{entityDisplayType(entity)}</span>
          <span className="dot-divider">·</span>
          <span>ID {entity.id.slice(-6)}</span>
        </div>
      </div>
      <div className="entity-heading-actions">
        <IconButton title={entity.visible ? '隐藏' : '显示'} onClick={() => toggleVisibility(entity.id)}>
          {entity.visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </IconButton>
        <IconButton
          title="聚焦图元"
          onClick={() => {
            useApp.getState().setSelection([{ id: entity.id }]);
            setTimeout(() => getViewportController()?.fitSelection(), 20);
          }}
        >
          <Focus size={15} />
        </IconButton>
      </div>
    </div>
  );
}

const SOLID_PARAMS: Record<SolidType, Array<{ key: string; label: string; min?: number; step?: number }>> = {
  cube: [{ key: 'size', label: '棱长', min: 0.1 }],
  cuboid: [
    { key: 'w', label: '长 (X)', min: 0.1 },
    { key: 'd', label: '宽 (Y)', min: 0.1 },
    { key: 'h', label: '高 (Z)', min: 0.1 },
  ],
  prism: [
    { key: 'sides', label: '底面边数', min: 3, step: 1 },
    { key: 'radius', label: '外接圆半径', min: 0.2 },
    { key: 'height', label: '高', min: 0.2 },
  ],
  pyramid: [
    { key: 'sides', label: '底面边数', min: 3, step: 1 },
    { key: 'radius', label: '外接圆半径', min: 0.2 },
    { key: 'height', label: '高', min: 0.2 },
  ],
  cylinder: [
    { key: 'radius', label: '底面半径', min: 0.2 },
    { key: 'height', label: '高', min: 0.2 },
  ],
  cone: [
    { key: 'radius', label: '底面半径', min: 0.2 },
    { key: 'height', label: '高', min: 0.2 },
  ],
  sphere: [{ key: 'radius', label: '半径', min: 0.2 }],
  tetra: [{ key: 'size', label: '棱长', min: 0.2 }],
  extrude: [{ key: 'height', label: '拉伸高度' }],
};

function MetricCards({ solid }: { solid: SolidEntity }) {
  const m = solidMetrics(solid);
  return (
    <div className="metric-grid">
      <div className="metric-card">
        <span>表面积 S</span>
        <strong>{fmt(m.surfaceArea, 4)}</strong>
        <small>{m.exact ? '精确公式' : '网格积分'}</small>
      </div>
      <div className="metric-card">
        <span>体积 V</span>
        <strong>{fmt(m.volume, 4)}</strong>
        <small>{m.exact ? '精确公式' : '网格积分'}</small>
      </div>
    </div>
  );
}

function SolidProps({ solid }: { solid: SolidEntity }) {
  const definitions = SOLID_PARAMS[solid.solidType];
  const [params, setParams] = useState<Record<string, number>>({ ...solid.params });
  const [opacity, setOpacity] = useState(solid.opacity);
  useEffect(() => {
    setParams({ ...solid.params });
  }, [solid.id, JSON.stringify(solid.params)]);
  useEffect(() => setOpacity(solid.opacity), [solid.opacity]);
  const m = solidMetrics(solid);
  const apply = () => {
    const cleaned: Record<string, number> = {};
    for (const def of definitions) {
      const value = Number(params[def.key]);
      if (Number.isFinite(value)) cleaned[def.key] = value;
    }
    cleaned.cx = Number(params.cx) || 0;
    cleaned.cy = Number(params.cy) || 0;
    cleaned.cz = Number(params.cz) || 0;
    useApp.getState().regenerateSolid(solid.id, cleaned);
  };
  return (
    <>
      <div className="topology-strip">
        <span><em>{m.vertexCount}</em>顶点</span>
        <span><em>{m.edgeCount}</em>棱</span>
        <span><em>{m.faceCount}</em>面</span>
        <span className="topology-euler">V−E+F={m.vertexCount - m.edgeCount + m.faceCount}</span>
      </div>
      <MetricCards solid={solid} />
      <div className="props-scroll-inner">
        <SectionLabel>参数调整</SectionLabel>
        <div className="form-grid">
          {definitions.map((def) => (
            <NumberField
              key={def.key}
              label={def.label}
              min={def.min}
              step={def.step ?? 0.1}
              value={Number(params[def.key] ?? 0)}
              onChange={(value) => setParams((p) => ({ ...p, [def.key]: value }))}
            />
          ))}
          {solid.solidType !== 'extrude' ? (
            <>
              <NumberField label="中心 X" value={Number(params.cx ?? 0)} onChange={(v) => setParams((p) => ({ ...p, cx: v }))} />
              <NumberField label="中心 Y" value={Number(params.cy ?? 0)} onChange={(v) => setParams((p) => ({ ...p, cy: v }))} />
              <NumberField label="中心 Z" value={Number(params.cz ?? 0)} onChange={(v) => setParams((p) => ({ ...p, cz: v }))} />
            </>
          ) : null}
        </div>
        {solid.solidType !== 'extrude' ? (
          <button type="button" className="primary-button full" onClick={apply}>
            应用参数并重建
          </button>
        ) : (
          <div className="info-card">拉伸体由选定面与高度生成；如需调整请重新执行「由面拉伸成体」。</div>
        )}
        <SectionLabel>显示</SectionLabel>
        <div className="range-field">
          <span>透明度</span>
          <input
            type="range"
            min={0.02}
            max={0.85}
            step={0.01}
            value={opacity}
            onChange={(e) => {
              const v = Number(e.target.value);
              setOpacity(v);
              useApp.getState().setSolidOpacity(solid.id, v);
            }}
          />
          <em>{Math.round(opacity * 100)}%</em>
        </div>
        <div className="action-row">
          <button type="button" className="soft-button" onClick={() => useApp.getState().openSection()}>
            <Scissors size={15} /> 生成截面
          </button>
          <button
            type="button"
            className="soft-button"
            onClick={() => {
              useApp.getState().setSelection([{ id: solid.id }]);
              getViewportController()?.fitSelection();
            }}
          >
            <Focus size={15} /> 聚焦
          </button>
        </div>
        {solid.deformed ? (
          <div className="info-card warn">
            <Info size={14} />
            <p>顶点已被拖动，面积和体积按三角网格数值积分；应用参数可恢复标准几何体。</p>
          </div>
        ) : null}
        <div className="dim-note">拖动白色顶点可实时修改几何体，Ctrl+Z 撤销。</div>
      </div>
    </>
  );
}

function PointProps({ point }: { point: PointEntity }) {
  const [xyz, setXyz] = useState<[number, number, number]>(point.pos);
  useEffect(() => setXyz([...point.pos]), [point.id, point.pos[0], point.pos[1], point.pos[2]]);
  return (
    <>
      <SectionLabel>点坐标</SectionLabel>
      <div className="form-grid three">
        <NumberField label="X" value={xyz[0]} onChange={(v) => setXyz([v, xyz[1], xyz[2]])} />
        <NumberField label="Y" value={xyz[1]} onChange={(v) => setXyz([xyz[0], v, xyz[2]])} />
        <NumberField label="Z" value={xyz[2]} onChange={(v) => setXyz([xyz[0], xyz[1], v])} />
      </div>
      <button
        type="button"
        className="primary-button full"
        onClick={() => useApp.getState().updatePointPosition(point.id, xyz)}
      >
        应用坐标
      </button>
      <div className="stat-strip">
        <span>到原点距离 <strong>{fmt(len(xyz), 4)}</strong></span>
        <span>坐标 <strong>{fmtVec(point.pos, 3)}</strong></span>
      </div>
      <div className="action-row">
        <button type="button" className="soft-button" onClick={() => copyText(fmtVec(point.pos, 4))}>
          <Copy size={14} /> 复制坐标
        </button>
      </div>
      <div className="dim-note">在视口中直接拖动点也可以改变位置，Shift 拖拽吸附到 0.25 网格。</div>
    </>
  );
}

function LineProps({ entity }: { entity: SegmentEntity | import('../core/types').LineEntity }) {
  const entities = useApp((s) => s.entities);
  const seg = resolveSegment(entity, entities);
  if (!seg) return <div className="info-card warn">端点引用已失效。</div>;
  return (
    <>
      <SectionLabel>{entity.type === 'line' ? '直线信息' : '线段信息'}</SectionLabel>
      <FieldRow label="端点 A" value={seg.labelA} />
      <FieldRow label="坐标 A" value={fmtVec(seg.a, 3)} mono />
      <FieldRow label="端点 B" value={seg.labelB} />
      <FieldRow label="坐标 B" value={fmtVec(seg.b, 3)} mono />
      <FieldRow label={entity.type === 'line' ? '参考长度' : '长度'} value={fmt(len(seg.dir), 4)} accent="cyan" />
      <FieldRow label="方向向量" value={fmtVec(norm(seg.dir), 4)} mono />
      <FieldRow label="中点" value={fmtVec(mul(add(seg.a, seg.b), 0.5), 3)} mono />
    </>
  );
}

function PlaneProps({ plane }: { plane: PlaneEntity }) {
  const entities = useApp((s) => s.entities);
  const p = resolvePlane(plane.definition, entities);
  if (!p) return <div className="info-card warn">平面定义失效。</div>;
  const n = norm(p.normal);
  const equation = `${fmt(n[0], 3)}x + ${fmt(n[1], 3)}y + ${fmt(n[2], 3)}z + ${fmt(-dot(n, p.point), 3)} = 0`;
  return (
    <>
      <SectionLabel>平面方程</SectionLabel>
      <div className="equation-box">{equation}</div>
      <FieldRow label="法向量" value={fmtVec(n, 4)} mono />
      <FieldRow label="过点" value={fmtVec(p.point, 3)} mono />
      {plane.definition.kind === 'points' ? (
        <>
          <FieldRow label="定义点 A" value={resolveAnchor(plane.definition.a, entities)?.label ?? '—'} />
          <FieldRow label="定义点 B" value={resolveAnchor(plane.definition.b, entities)?.label ?? '—'} />
          <FieldRow label="定义点 C" value={resolveAnchor(plane.definition.c, entities)?.label ?? '—'} />
        </>
      ) : (
        <div className="info-card">自由平面（由一点与法向量定义），常用于轴向截面。</div>
      )}
      <SectionLabel>可视范围</SectionLabel>
      <NumberField
        label="平面片尺寸"
        value={plane.size}
        min={1}
        max={30}
        onChange={(size) => useApp.getState().updateEntity(plane.id, (e) => ({ ...e, size } as Entity), '调整平面尺寸')}
      />
      <div className="action-row">
        <button
          type="button"
          className="soft-button"
          onClick={() => {
            useApp.getState().setSelection([{ id: plane.id }]);
            getViewportController()?.fitSelection();
          }}
        >
          <Focus size={14} /> 聚焦
        </button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().openSection()}>
          <Scissors size={14} /> 用作截面
        </button>
      </div>
    </>
  );
}

function CircleProps({ circle }: { circle: CircleEntity }) {
  const entities = useApp((s) => s.entities);
  const c = resolveCircle(circle, entities);
  const [radius, setRadius] = useState(circle.radius);
  const [sweep, setSweep] = useState((circle.sweep * 180) / Math.PI);
  const [normal, setNormal] = useState(circle.normal);
  useEffect(() => {
    setRadius(circle.radius);
    setSweep((circle.sweep * 180) / Math.PI);
    setNormal(circle.normal);
  }, [circle.id, circle.radius, circle.sweep, circle.normal[0], circle.normal[1], circle.normal[2]]);
  if (!c) return <div className="info-card warn">圆心引用失效。</div>;
  const sweepRad = (sweep * Math.PI) / 180;
  return (
    <>
      <SectionLabel>圆 / 圆弧参数</SectionLabel>
      <div className="form-grid">
        <NumberField label="半径" value={radius} min={0.01} onChange={setRadius} />
        <NumberField label="圆心角" value={sweep} step={5} unit="°" onChange={setSweep} />
      </div>
      <div className="form-grid three">
        <NumberField label="法向 X" value={normal[0]} onChange={(v) => setNormal([v, normal[1], normal[2]])} />
        <NumberField label="法向 Y" value={normal[1]} onChange={(v) => setNormal([normal[0], v, normal[2]])} />
        <NumberField label="法向 Z" value={normal[2]} onChange={(v) => setNormal([normal[0], normal[1], v])} />
      </div>
      <button
        type="button"
        className="primary-button full"
        onClick={() => useApp.getState().updateCircleParams(circle.id, { radius, sweep: sweepRad, normal })}
      >
        应用参数
      </button>
      <div className="metric-grid">
        <div className="metric-card">
          <span>弧长</span>
          <strong>{fmt(Math.abs(sweepRad) * radius, 4)}</strong>
          <small>{Math.abs(Math.abs(sweepRad) - Math.PI * 2) < 1e-4 ? '整圆周长' : '圆弧'}</small>
        </div>
        <div className="metric-card">
          <span>扇形面积</span>
          <strong>{fmt(0.5 * radius * radius * Math.abs(sweepRad), 4)}</strong>
          <small>圆心角 {fmt(Math.abs(sweep), 2)}°</small>
        </div>
      </div>
      <FieldRow label="圆心" value={fmtVec(c.center, 3)} mono />
      <FieldRow label="圆心点" value={resolveAnchor(circle.center, entities)?.label ?? '—'} />
    </>
  );
}

function VectorProps({ vector }: { vector: VectorEntity }) {
  const entities = useApp((s) => s.entities);
  const v = resolveVector(vector, entities);
  if (!v) return <div className="info-card warn">向量定义失效。</div>;
  const unit = directionCosines(v.value);
  return (
    <>
      <SectionLabel>向量分量</SectionLabel>
      <FieldRow label="起点" value={fmtVec(v.origin, 3)} mono />
      <FieldRow label="分量 (a₁,a₂,a₃)" value={fmtVec(v.value, 4)} mono />
      <FieldRow label="模长 |a|" value={fmt(len(v.value), 4)} accent="amber" />
      <FieldRow label="单位向量" value={fmtVec(unit, 4)} mono />
      <SectionLabel>方向余弦</SectionLabel>
      <div className="cosine-grid">
        <div><span>cos α</span><strong>{fmt(unit[0], 4)}</strong></div>
        <div><span>cos β</span><strong>{fmt(unit[1], 4)}</strong></div>
        <div><span>cos γ</span><strong>{fmt(unit[2], 4)}</strong></div>
      </div>
      <div className="action-row">
        <button type="button" className="soft-button" onClick={() => useApp.getState().vectorOp('magnitude')}>
          <Sigma size={14} /> 模长步骤
        </button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().vectorOp('unit')}>
          单位向量
        </button>
      </div>
      <div className="dim-note">按住 Ctrl 再选择另一个向量，即可进行加减、点积、叉积与投影运算。</div>
    </>
  );
}

function SectionProps({ section }: { section: SectionEntity }) {
  const entities = useApp((s) => s.entities);
  const solid = entities.find((e) => e.id === section.solidId);
  const polys = sectionPolygons(section, entities);
  const area = sectionArea(section, entities);
  return (
    <>
      <SectionLabel>截面信息</SectionLabel>
      <FieldRow label="目标立体" value={solid?.name ?? '已删除'} />
      <FieldRow label="截面面积" value={fmt(area, 4)} accent="rose" />
      <FieldRow label="多边形数量" value={polys.length} />
      <FieldRow label="顶点数量" value={polys.reduce((s, p) => s + p.points.length, 0)} />
      <FieldRow label="截痕周长" value={fmt(polys.reduce((s, p) => s + polygonPerimeter(p.points), 0), 4)} />
      <SectionLabel>显示与切割</SectionLabel>
      <Switch
        label="裁切立体（剖切显示）"
        checked={section.clip}
        onChange={(clip) =>
          useApp.getState().updateEntity(section.id, (e) => ({ ...e, clip } as Entity), '切换剖切')
        }
      />
      <Switch
        label="填充截面多边形"
        checked={section.fill}
        onChange={(fill) =>
          useApp.getState().updateEntity(section.id, (e) => ({ ...e, fill } as Entity), '切换截面填充')
        }
      />
      <SectionLabel>单独导出</SectionLabel>
      <div className="action-row">
        <button type="button" className="soft-button" onClick={() => void exportSectionFile(section.id, 'svg')}>
          <Download size={14} /> 导出截面 SVG
        </button>
        <button type="button" className="soft-button" onClick={() => void exportSectionFile(section.id, 'obj')}>
          <Download size={14} /> 导出截面 OBJ
        </button>
      </div>
      <div className="dim-note">截面随立体或定义平面实时更新。裁切显示只影响渲染，不改变体积度量。</div>
    </>
  );
}

function PartProps({ entity, part }: { entity: SolidEntity; part: NonNullable<SelectionRef['part']> }) {
  const entities = useApp((s) => s.entities);
  if (part.kind === 'vertex') {
    const pos = entity.vertices[part.index];
    if (!pos) return null;
    return (
      <>
        <SectionLabel>顶点信息</SectionLabel>
        <FieldRow label="顶点字母" value={entity.vertexNames[part.index] || '—'} accent="amber" />
        <FieldRow label="坐标" value={fmtVec(pos, 4)} mono />
        <FieldRow label="所属立体" value={entity.name} />
        <div className="info-card">在视口中直接拖拽这个白色顶点，几何体与全部关联度量会实时更新。</div>
        <div className="action-row">
          <button type="button" className="soft-button" onClick={() => copyText(fmtVec(pos, 4))}>
            <Copy size={14} /> 复制坐标
          </button>
        </div>
      </>
    );
  }
  if (part.kind === 'edge') {
    const edge = entity.edges[part.index];
    if (!edge) return null;
    const a = entity.vertices[edge[0]];
    const b = entity.vertices[edge[1]];
    return (
      <>
        <SectionLabel>棱信息</SectionLabel>
        <FieldRow label="端点" value={`${entity.vertexNames[edge[0]]}${entity.vertexNames[edge[1]]}`} accent="amber" />
        <FieldRow label="长度" value={fmt(dist(a, b), 4)} />
        <FieldRow label="端点 A" value={fmtVec(a, 3)} mono />
        <FieldRow label="端点 B" value={fmtVec(b, 3)} mono />
        <FieldRow label="中点" value={fmtVec(mul(add(a, b), 0.5), 3)} mono />
      </>
    );
  }
  const face = entity.faces[part.index];
  if (!face) return null;
  const points = face.map((i) => entity.vertices[i]);
  const n = norm(
    [
      (points[1][1] - points[0][1]) * (points[2][2] - points[0][2]) - (points[1][2] - points[0][2]) * (points[2][1] - points[0][1]),
      (points[1][2] - points[0][2]) * (points[2][0] - points[0][0]) - (points[1][0] - points[0][0]) * (points[2][2] - points[0][2]),
      (points[1][0] - points[0][0]) * (points[2][1] - points[0][1]) - (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]),
    ],
  );
  const area = polygonArea(points);
  return (
    <>
      <SectionLabel>面信息</SectionLabel>
      <FieldRow label="面序号" value={`#${part.index + 1}`} accent="amber" />
      <FieldRow label="顶点" value={face.map((i) => entity.vertexNames[i] || i + 1).join(' → ')} />
      <FieldRow label="面积" value={fmt(area, 4)} />
      <FieldRow label="法向量" value={fmtVec(n, 4)} mono />
      <div className="action-row">
        <button
          type="button"
          className="soft-button"
          onClick={() => {
            const state = useApp.getState();
            const plane = makePlane(state.entities, { kind: 'free', point: points[0], normal: n }, { color: '#fcd34d' });
            state.addEntities([plane], '由选中面建平面', [{ id: plane.id }]);
            state.toast('已由选中面建立平面', 'success');
          }}
        >
          <Layers size={14} /> 由面建平面
        </button>
      </div>
      <div className="dim-note">切换选择模式为「面」后，点击立体的表面即可选中面。</div>
    </>
  );
}

function SingleSelection({ refId }: { refId: string }) {
  const selection = useApp((s) => s.selection);
  const entities = useApp((s) => s.entities);
  const ref = selection.find((s) => s.id === refId);
  const entity = entities.find((e) => e.id === refId);
  if (!entity || !ref) return <EmptyHint icon={<Info size={28} />} title="图元已被删除" detail="请重新选择场景中的图元。" />;
  const label = selectionLabel(ref, entities);
  return (
    <>
      <EntityHeading entity={entity} label={label} />
      <div className="inspector-content">
        {ref.part && entity.type === 'solid' ? (
          <PartProps entity={entity} part={ref.part} />
        ) : (
          <>
            {entity.type === 'point' ? <PointProps point={entity} /> : null}
            {entity.type === 'segment' || entity.type === 'line' ? <LineProps entity={entity} /> : null}
            {entity.type === 'plane' ? <PlaneProps plane={entity} /> : null}
            {entity.type === 'circle' ? <CircleProps circle={entity} /> : null}
            {entity.type === 'vector' ? <VectorProps vector={entity} /> : null}
            {entity.type === 'solid' ? <SolidProps solid={entity} /> : null}
            {entity.type === 'section' ? <SectionProps section={entity} /> : null}
            {entity.type === 'trail' ? (
              <FieldRow label="轨迹点数量" value={entity.points.length} />
            ) : null}
          </>
        )}
        <div className="property-footer">
          <button type="button" className="danger-text" onClick={() => useApp.getState().deleteSelected()}>
            <Trash2 size={14} /> 删除此图元
          </button>
          <span>Del</span>
        </div>
      </div>
    </>
  );
}

function SelectionOverview() {
  const selection = useApp((s) => s.selection);
  const entities = useApp((s) => s.entities);
  const clearSelection = useApp((s) => s.clearSelection);
  const relations = useMemo(() => selectionRelations(selection, entities), [selection, entities]);
  const metrics = useMemo(() => selectionMetrics(selection, entities), [selection, entities]);
  const vectorCount = useMemo(() => selectedVectorsInfo(selection, entities).length, [selection, entities]);
  if (!selection.length) {
    return (
      <div className="inspector-empty">
        <EmptyHint
          icon={<MouseHint />}
          title="未选择图元"
          detail="在视口中点击图元，或按住 Ctrl 多选。右侧会实时显示坐标、关系判定与度量结果。"
        />
        <div className="inspector-tips">
          <div><span>01</span><p>拖动白色顶点实时变形</p></div>
          <div><span>02</span><p>Ctrl 多选判平行 / 垂直 / 异面</p></div>
          <div><span>03</span><p>选中立体与平面生成截面</p></div>
        </div>
      </div>
    );
  }
  return (
    <div className="inspector-content">
      <div className="selection-summary">
        <div>
          <span className="panel-eyebrow">SELECTION</span>
          <h3>{selection.length} 个图元已选中</h3>
        </div>
        <button type="button" className="soft-button" onClick={clearSelection}>
          <X size={14} /> 清除
        </button>
      </div>
      <div className="selection-chips">
        {selection.map((ref) => (
          <span className="selection-chip" key={`${ref.id}-${ref.part?.kind ?? 'all'}-${ref.part?.index ?? ''}`}>
            {selectionLabel(ref, entities)}
          </span>
        ))}
      </div>
      {relations.length ? (
        <>
          <SectionLabel>自动关系判定</SectionLabel>
          <div className="relation-list compact">
            {relations.map((r, i) => (
              <span className={`relation-badge kind-${r.kind}`} key={i}>{r.label}</span>
            ))}
          </div>
        </>
      ) : null}
      <SectionLabel>选择集度量</SectionLabel>
      <div className="measure-list">
        {metrics.slice(0, 8).map((item, i) => (
          <div className="measure-row" key={i}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="inspector-actions">
        <button type="button" className="soft-button" onClick={() => useApp.getState().measureSelection()}>
          <Ruler size={14} /> 全部度量
        </button>
        {vectorCount >= 2 ? (
          <button type="button" className="soft-button" onClick={() => useApp.getState().vectorOp('dot')}>
            <Sigma size={14} /> 向量点积
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MouseHint() {
  return (
    <svg width="54" height="54" viewBox="0 0 54 54" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="9" y="7" width="36" height="42" rx="14" />
      <path d="M27 17v9" strokeWidth="2" />
      <path d="M19 29l8 14 3-7 7-3-18-4Z" fill="currentColor" fillOpacity=".14" />
    </svg>
  );
}

function PropsTab() {
  const selection = useApp((s) => s.selection);
  if (selection.length === 0) return <SelectionOverview />;
  if (selection.length > 1) return <SelectionOverview />;
  return <SingleSelection refId={selection[0].id} />;
}

function relationClass(kind: string) {
  return `relation-badge kind-${kind}`;
}

function MeasureTab() {
  const selection = useApp((s) => s.selection);
  const entities = useApp((s) => s.entities);
  const report = useApp((s) => s.measureReport);
  const dismiss = useApp((s) => s.dismissMeasure);
  const relations = useMemo(() => selectionRelations(selection, entities), [selection, entities]);
  const metrics = useMemo(() => selectionMetrics(selection, entities), [selection, entities]);
  return (
    <div className="inspector-content">
      {report ? (
        <div className="report-card">
          <div className="report-head">
            <div>
              <span className="panel-eyebrow">MEASUREMENT</span>
              <h3>{report.title}</h3>
            </div>
            <IconButton title="关闭度量结果" onClick={dismiss}><X size={14} /></IconButton>
          </div>
          {report.items.map((item, i) => (
            <div className="report-value" key={i}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
            </div>
          ))}
          {report.steps ? (
            <div className="steps">
              {report.steps.steps.map((s, i) => (
                <div key={i}><span>{i + 1}</span><p>{s}</p></div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <SectionLabel action={<span className="section-meta">{selection.length} 项</span>}>几何关系</SectionLabel>
      {selection.length < 2 ? (
        <div className="info-card">选择两个或多个图元后，这里会立即显示平行、垂直、共线、共面、异面等判定。</div>
      ) : relations.length ? (
        <div className="relation-list">
          {relations.map((r, i) => (
            <div className="relation-item" key={i}>
              <span className={relationClass(r.kind)}>{r.label}</span>
              <div>
                <p>{r.detail ?? '—'}</p>
                <small>{r.between}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="info-card">当前组合没有命中内置关系规则，可继续查看下方度量。</div>
      )}
      <SectionLabel>实时度量</SectionLabel>
      {selection.length === 0 ? (
        <EmptyHint icon={<Ruler size={28} />} title="选择图元以开始度量" detail="长度、角度、线面角、二面角、异面角、距离、表面积和体积都会实时刷新。" />
      ) : metrics.length ? (
        <div className="measure-list">
          {metrics.map((item, i) => (
            <div className="measure-row" key={i}>
              <div>
                <span>{item.label}</span>
                {item.detail ? <small>{item.detail}</small> : null}
              </div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="info-card">当前选择没有可直接计算的度量项。</div>
      )}
      <SectionLabel>快速度量</SectionLabel>
      <div className="measure-actions">
        <button type="button" className="soft-button" onClick={() => useApp.getState().measure('length')}>长度</button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().measure('angle')}>角度</button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().measure('linePlaneAngle')}>线面角</button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().measure('dihedral')}>二面角</button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().measure('skewAngle')}>异面角</button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().measure('pointPlaneDistance')}>点面距</button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().measure('surfaceArea')}>表面积</button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().measure('volume')}>体积</button>
      </div>
      <div className="measure-method">
        <button type="button" className="soft-button" onClick={() => useApp.getState().showVectorSteps('linePlane')}>
          <ArrowUpRight size={14} /> 向量法求线面角
        </button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().showVectorSteps('dihedral')}>
          <ArrowUpRight size={14} /> 向量法求二面角
        </button>
      </div>
    </div>
  );
}

function VectorTab() {
  const selection = useApp((s) => s.selection);
  const entities = useApp((s) => s.entities);
  const report = useApp((s) => s.vectorReport);
  const vectors = useMemo(() => selectedVectorsInfo(selection, entities), [selection, entities]);
  const dims = vectors.map((v) => fmt(len(v.value), 3)).join(' / ');
  return (
    <div className="inspector-content">
      <div className="vector-top">
        <div>
          <span className="panel-eyebrow">VECTOR LAB</span>
          <h3>空间向量计算</h3>
          <p>{vectors.length ? `已选 ${vectors.length} 个向量 · 模长 ${dims}` : '选中两个点可生成向量，或打开向量对话框。'}</p>
        </div>
        <button type="button" className="primary-icon-button" onClick={() => useApp.getState().createVectorFromSelection()}>
          <Plus size={17} />
        </button>
      </div>
      {vectors.length ? (
        <div className="vector-cards">
          {vectors.map((v) => (
            <div className="vector-card" key={v.id}>
              <div className="vector-card-head">
                <strong>{v.label}</strong>
                <span>{fmt(v.magnitude, 4)}</span>
              </div>
              <code>{fmtVec(v.value, 3)}</code>
              <div className="vector-cosines">
                <span>cosα {fmt(v.cosines[0], 3)}</span>
                <span>cosβ {fmt(v.cosines[1], 3)}</span>
                <span>cosγ {fmt(v.cosines[2], 3)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="info-card">在视口中选中两个点，然后点击右上角 +，即可创建从第一点到第二点的空间向量。</div>
      )}
      <SectionLabel>向量运算</SectionLabel>
      <div className="vector-ops">
        <button type="button" onClick={() => useApp.getState().vectorOp('add')}>a + b</button>
        <button type="button" onClick={() => useApp.getState().vectorOp('sub')}>a − b</button>
        <button type="button" onClick={() => useApp.getState().setDialog({ kind: 'vector-scalar' })}>λa</button>
        <button type="button" onClick={() => useApp.getState().vectorOp('dot')}>a · b</button>
        <button type="button" onClick={() => useApp.getState().vectorOp('cross')}>a × b</button>
        <button type="button" onClick={() => useApp.getState().vectorOp('magnitude')}>|a|</button>
        <button type="button" onClick={() => useApp.getState().vectorOp('unit')}>单位</button>
        <button type="button" onClick={() => useApp.getState().vectorOp('angle')}>夹角</button>
        <button type="button" onClick={() => useApp.getState().vectorOp('projection')}>投影</button>
      </div>
      <SectionLabel>向量法解题步骤</SectionLabel>
      <div className="measure-method">
        <button type="button" className="soft-button" onClick={() => useApp.getState().showVectorSteps('linePlane')}>
          线面角
        </button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().showVectorSteps('dihedral')}>
          二面角
        </button>
      </div>
      {report ? (
        <div className="vector-report">
          <div className="report-head">
            <div>
              <span className="panel-eyebrow">RESULT</span>
              <h3>{report.title}</h3>
            </div>
            <IconButton title="关闭结果" onClick={() => useApp.getState().dismissVector()}><X size={14} /></IconButton>
          </div>
          <div className="vector-result">{report.result}</div>
          <div className="steps">
            {report.steps.map((s, i) => (
              <div key={i}><span>{i + 1}</span><p>{s}</p></div>
            ))}
          </div>
          {report.resultValue ? (
            <button type="button" className="primary-button full" onClick={() => useApp.getState().addVectorReportToScene()}>
              <Plus size={15} /> 将结果向量加入场景
            </button>
          ) : null}
          <button type="button" className="soft-button full" onClick={() => copyText(report.result)}>
            <Copy size={14} /> 复制结果
          </button>
        </div>
      ) : (
        <div className="info-card">选择两个向量后执行运算，这里会展示每一步的代入计算、结果与方向余弦。</div>
      )}
    </div>
  );
}

function AnimateTab() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const selection = useApp((s) => s.selection);
  const controller = () => getViewportController();
  return (
    <div className="inspector-content">
      <div className="animation-hero">
        <span className="animation-orb"><Sparkles size={20} /></span>
        <div>
          <span className="panel-eyebrow">MOTION</span>
          <h3>动态演示</h3>
          <p>用运动与轨迹解释空间关系，适合课堂投屏。</p>
        </div>
      </div>
      <div className="animation-auto">
        <div>
          <strong>模型自动旋转</strong>
          <small>主视口环绕模型旋转，正交视图保持同步刷新</small>
        </div>
        <button
          type="button"
          className={`animation-toggle ${settings.autoRotate ? 'is-on' : ''}`}
          onClick={() => setSettings({ autoRotate: !settings.autoRotate })}
        >
          {settings.autoRotate ? <Pause size={15} /> : <Play size={15} />}
          {settings.autoRotate ? '停止' : '开始'}
        </button>
      </div>
      <div className="speed-field">
        <span>旋转速度</span>
        <input
          type="range"
          min={0.04}
          max={0.9}
          step={0.01}
          value={settings.autoRotateSpeed}
          onChange={(e) => setSettings({ autoRotateSpeed: Number(e.target.value) })}
        />
        <em>{fmt(settings.autoRotateSpeed, 2)}</em>
      </div>
      <SectionLabel action={<span className="section-meta">{selection.length} 项选中</span>}>动画工具</SectionLabel>
      <div className="animation-cards">
        <button
          type="button"
          className="animation-card"
          onClick={() => controller()?.startTraceAnimation()}
        >
          <span className="anim-icon"><Timer size={18} /></span>
          <span>
            <strong>动点轨迹</strong>
            <small>选中线段、直线或圆，让动点沿路径运动并留下轨迹。</small>
          </span>
          <Play size={14} className="anim-go" />
        </button>
        <button
          type="button"
          className="animation-card"
          onClick={() => controller()?.startRevolveAnimation()}
        >
          <span className="anim-icon"><RotateCw size={18} /></span>
          <span>
            <strong>旋转体生成过程</strong>
            <small>选中一条线段，绕 Z 轴旋转并实时生成旋转曲面。</small>
          </span>
          <Play size={14} className="anim-go" />
        </button>
        <button
          type="button"
          className="animation-card"
          onClick={() => controller()?.pulseSelection()}
        >
          <span className="anim-icon"><ScanLine size={18} /></span>
          <span>
            <strong>辅助线显隐动画</strong>
            <small>让选中图元呼吸式闪烁，便于强调辅助线或关键棱。</small>
          </span>
          <Play size={14} className="anim-go" />
        </button>
      </div>
      <button
        type="button"
        className="soft-button full"
        onClick={() => controller()?.stopAnimations()}
      >
        停止全部动画
      </button>
      <div className="info-card">
        <p><strong>操作提示</strong>：轨迹动画与旋转体动画会临时绘制标记和曲面，不改变场景实体；显隐动画会恢复原始透明度。</p>
      </div>
      <div className="view-toggle-list">
        <Switch label="视图联动（平移 / 缩放同步）" checked={settings.linked} onChange={(linked) => setSettings({ linked })} />
        <Switch label="显示虚隐线" checked={settings.showHidden} onChange={(showHidden) => setSettings({ showHidden })} />
        <Switch label="度量标注" checked={settings.showMeasures} onChange={(showMeasures) => setSettings({ showMeasures })} />
        <Switch label="线框模式" checked={settings.wireframe} onChange={(wireframe) => setSettings({ wireframe })} />
      </div>
    </div>
  );
}

export function Inspector() {
  const rightTab = useApp((s) => s.rightTab);
  const setRightTab = useApp((s) => s.setRightTab);
  const selection = useApp((s) => s.selection);
  const vectorCount = useApp((s) => selectedVectorsInfo(s.selection, s.entities).length);
  const report = useApp((s) => s.vectorReport);
  return (
    <aside className="side-panel right-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-eyebrow">INSPECT</span>
          <h2>属性与度量</h2>
        </div>
        <span className="panel-accent amber" />
      </div>
      <div className="panel-tabs">
        {tabButton('props', rightTab, setRightTab, '属性', selection.length)}
        {tabButton('measure', rightTab, setRightTab, '度量')}
        {tabButton('vector', rightTab, setRightTab, '向量', report ? 1 : vectorCount)}
        {tabButton('animate', rightTab, setRightTab, '演示')}
      </div>
      {rightTab === 'props' ? (
        <PropsTab />
      ) : rightTab === 'measure' ? (
        <MeasureTab />
      ) : rightTab === 'vector' ? (
        <VectorTab />
      ) : (
        <AnimateTab />
      )}
    </aside>
  );
}
