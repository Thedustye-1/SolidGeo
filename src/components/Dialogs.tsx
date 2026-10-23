import React, { useMemo, useState } from 'react';
import {
  Box,
  Circle,
  Cone,
  Cylinder,
  Globe,
  Info,
  Keyboard,
  Layers,
  Scissors,
  Sparkles,
  Triangle,
} from 'lucide-react';
import type { SolidType, Vec3 } from '../core/types';
import { buildSolid, entityDisplayType } from '../core/entities';
import { fmt, fmtVec, len, sub } from '../core/math';
import { useApp } from '../store/useApp';
import { SHORTCUTS, GUIDE_STEPS } from '../lib/shortcuts';
import { saveProject } from '../lib/sceneActions';
import { FieldRow, Modal, NumberField, SectionLabel, SolidGlyph, Switch, TextField } from './common';

function FooterButtons({
  onCancel,
  onSubmit,
  submitLabel,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <>
      <button type="button" className="ghost-button" onClick={onCancel}>取消</button>
      <button type="button" className="primary-button" onClick={onSubmit} disabled={disabled}>
        {submitLabel}
      </button>
    </>
  );
}

function PointDialog() {
  const dialog = useApp((s) => s.dialog);
  const initial = dialog?.kind === 'point' ? dialog.pos : undefined;
  const [x, setX] = useState(initial?.[0] ?? 0);
  const [y, setY] = useState(initial?.[1] ?? 0);
  const [z, setZ] = useState(initial?.[2] ?? 0);
  const close = () => useApp.getState().setDialog(null);
  return (
    <Modal
      title="创建点"
      subtitle="输入三维坐标，或使用取点工具在视口中拾取"
      icon={<Sparkles size={18} />}
      onClose={close}
      footer={
        <FooterButtons
          onCancel={close}
          submitLabel="创建点"
          onSubmit={() => {
            useApp.getState().createPointAt([x, y, z]);
            close();
          }}
        />
      }
    >
      <div className="form-grid three">
        <NumberField label="X" value={x} onChange={setX} />
        <NumberField label="Y" value={y} onChange={setY} />
        <NumberField label="Z" value={z} onChange={setZ} />
      </div>
      <div className="modal-note">创建后可以直接在视口中拖动点。开启「吸附」后，拖动会以 0.25 为步长。</div>
    </Modal>
  );
}

const SOLID_DEFAULTS: Record<SolidType, Record<string, number>> = {
  cube: { size: 2.2, cx: 0, cy: 0, cz: 0 },
  cuboid: { w: 2.8, d: 1.8, h: 1.5, cx: 0, cy: 0, cz: 0 },
  prism: { sides: 6, radius: 1.4, height: 2.2, cx: 0, cy: 0, cz: 0 },
  pyramid: { sides: 4, radius: 1.5, height: 2.4, cx: 0, cy: 0, cz: 0 },
  cylinder: { radius: 1.2, height: 2.4, cx: 0, cy: 0, cz: 0 },
  cone: { radius: 1.3, height: 2.4, cx: 0, cy: 0, cz: 0 },
  sphere: { radius: 1.3, cx: 0, cy: 0, cz: 1.3 },
  tetra: { size: 2.2, cx: 0, cy: 0, cz: 0 },
  extrude: {},
};

const SOLID_FIELDS: Record<SolidType, Array<{ key: string; label: string; min?: number; step?: number }>> = {
  cube: [{ key: 'size', label: '棱长', min: 0.1 }],
  cuboid: [
    { key: 'w', label: '长 X', min: 0.1 },
    { key: 'd', label: '宽 Y', min: 0.1 },
    { key: 'h', label: '高 Z', min: 0.1 },
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
  extrude: [],
};

function SolidDialog({ solidType }: { solidType: SolidType }) {
  const close = () => useApp.getState().setDialog(null);
  const [params, setParams] = useState<Record<string, number>>({ ...SOLID_DEFAULTS[solidType] });
  const preview = useMemo(() => {
    try {
      return buildSolid(solidType, params);
    } catch {
      return null;
    }
  }, [solidType, params]);
  const titleMap: Record<SolidType, string> = {
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
  const iconMap: Record<SolidType, React.ReactNode> = {
    cube: <Box size={18} />,
    cuboid: <Box size={18} />,
    prism: <Layers size={18} />,
    pyramid: <Triangle size={18} />,
    cylinder: <Cylinder size={18} />,
    cone: <Cone size={18} />,
    sphere: <Globe size={18} />,
    tetra: <Triangle size={18} />,
    extrude: <Box size={18} />,
  };
  return (
    <Modal
      title={`创建${titleMap[solidType]}`}
      subtitle="设置参数与底面中心位置，创建后仍可拖动顶点或调整参数"
      icon={iconMap[solidType]}
      onClose={close}
      wide
      footer={
        <FooterButtons
          onCancel={close}
          submitLabel={`创建${titleMap[solidType]}`}
          disabled={!preview?.vertices.length}
          onSubmit={() => {
            useApp.getState().createSolid(solidType, params);
            close();
          }}
        />
      }
    >
      <div className="solid-dialog-layout">
        <div className={`solid-preview tone-${solidType}`}>
          <SolidGlyph type={solidType} size={140} />
          <div className="preview-stats">
            <span>{preview?.vertices.length ?? 0} 顶点</span>
            <span>{preview?.edges.length ?? 0} 棱</span>
            <span>{preview?.faces.length ?? 0} 面</span>
          </div>
          <div className="preview-hint">参数可随时在右侧属性面板中修改</div>
        </div>
        <div className="solid-form">
          <SectionLabel>几何参数</SectionLabel>
          <div className="form-grid">
            {SOLID_FIELDS[solidType].map((field) => (
              <NumberField
                key={field.key}
                label={field.label}
                min={field.min}
                step={field.step ?? 0.1}
                value={params[field.key] ?? 0}
                onChange={(value) => setParams((p) => ({ ...p, [field.key]: value }))}
              />
            ))}
          </div>
          <SectionLabel>位置</SectionLabel>
          <div className="form-grid three">
            <NumberField label="中心 X" value={params.cx ?? 0} onChange={(v) => setParams((p) => ({ ...p, cx: v }))} />
            <NumberField label="中心 Y" value={params.cy ?? 0} onChange={(v) => setParams((p) => ({ ...p, cy: v }))} />
            <NumberField label="中心 Z" value={params.cz ?? 0} onChange={(v) => setParams((p) => ({ ...p, cz: v }))} />
          </div>
          <div className="modal-note">
            立体以 Z 轴为竖直方向，初始放置在指定中心。创建后自动分配 A/B/C… 顶点字母。
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CircleDialog() {
  const close = () => useApp.getState().setDialog(null);
  const selection = useApp((s) => s.selection);
  const entities = useApp((s) => s.entities);
  const selectedPoint = entities.find((e) => e.type === 'point' && selection.some((s) => s.id === e.id) && !selection.find((s) => s.id === e.id)?.part);
  const [center, setCenter] = useState<Vec3>(selectedPoint?.type === 'point' ? selectedPoint.pos : [0, 0, 0]);
  const [normal, setNormal] = useState<Vec3>([0, 0, 1]);
  const [radius, setRadius] = useState(1.4);
  const [sweep, setSweep] = useState(360);
  const [start, setStart] = useState(0);
  return (
    <Modal
      title="创建圆 / 圆弧"
      subtitle="以圆心、法向量、半径与圆心角定义空间圆"
      icon={<Circle size={18} />}
      onClose={close}
      footer={
        <FooterButtons
          onCancel={close}
          submitLabel="创建"
          disabled={radius <= 0 || len(normal) < 1e-6}
          onSubmit={() => {
            useApp.getState().createCircle({ center, normal, radius, sweepDeg: sweep, startAngleDeg: start });
            close();
          }}
        />
      }
    >
      {selectedPoint ? (
        <div className="modal-note good">已选中点 {selectedPoint.name}，将直接以该点为圆心；下方圆心坐标仅在无选中点时使用。</div>
      ) : null}
      <SectionLabel>圆心</SectionLabel>
      <div className="form-grid three">
        <NumberField label="X" value={center[0]} onChange={(v) => setCenter([v, center[1], center[2]])} />
        <NumberField label="Y" value={center[1]} onChange={(v) => setCenter([center[0], v, center[2]])} />
        <NumberField label="Z" value={center[2]} onChange={(v) => setCenter([center[0], center[1], v])} />
      </div>
      <SectionLabel>法向量</SectionLabel>
      <div className="form-grid three">
        <NumberField label="Nx" value={normal[0]} onChange={(v) => setNormal([v, normal[1], normal[2]])} />
        <NumberField label="Ny" value={normal[1]} onChange={(v) => setNormal([normal[0], v, normal[2]])} />
        <NumberField label="Nz" value={normal[2]} onChange={(v) => setNormal([normal[0], normal[1], v])} />
      </div>
      <div className="form-grid three">
        <NumberField label="半径" value={radius} min={0.01} onChange={setRadius} />
        <NumberField label="圆心角" value={sweep} step={5} unit="°" onChange={setSweep} />
        <NumberField label="起始角" value={start} step={5} unit="°" onChange={setStart} />
      </div>
      <div className="modal-foot-note">360° 生成整圆，小于 360° 生成圆弧；圆弧长度与扇形面积会实时显示在属性面板。</div>
    </Modal>
  );
}

function VectorDialog() {
  const close = () => useApp.getState().setDialog(null);
  const selection = useApp((s) => s.selection);
  const entities = useApp((s) => s.entities);
  const points = entities.filter(
    (e) => e.type === 'point' && selection.some((s) => s.id === e.id && !s.part),
  );
  const [origin, setOrigin] = useState<Vec3>(points[0]?.type === 'point' ? points[0].pos : [0, 0, 0]);
  const [end, setEnd] = useState<Vec3>(points[1]?.type === 'point' ? points[1].pos : [2, 0, 0]);
  const value = sub(end, origin);
  return (
    <Modal
      title="添加空间向量"
      subtitle="输入起点与终点，生成带箭头的空间向量"
      icon={<ArrowGlyph />}
      onClose={close}
      footer={
        <FooterButtons
          onCancel={close}
          submitLabel="创建向量"
          disabled={len(value) < 1e-6}
          onSubmit={() => {
            useApp.getState().createVector(origin, value);
            close();
          }}
        />
      }
    >
      {points.length >= 2 ? (
        <div className="modal-note good">检测到两个选中点 {points[0].name}、{points[1].name}，已填入起点与终点。</div>
      ) : null}
      <SectionLabel>起点</SectionLabel>
      <div className="form-grid three">
        <NumberField label="X" value={origin[0]} onChange={(v) => setOrigin([v, origin[1], origin[2]])} />
        <NumberField label="Y" value={origin[1]} onChange={(v) => setOrigin([origin[0], v, origin[2]])} />
        <NumberField label="Z" value={origin[2]} onChange={(v) => setOrigin([origin[0], origin[1], v])} />
      </div>
      <SectionLabel>终点</SectionLabel>
      <div className="form-grid three">
        <NumberField label="X" value={end[0]} onChange={(v) => setEnd([v, end[1], end[2]])} />
        <NumberField label="Y" value={end[1]} onChange={(v) => setEnd([end[0], v, end[2]])} />
        <NumberField label="Z" value={end[2]} onChange={(v) => setEnd([end[0], end[1], v])} />
      </div>
      <FieldRow label="分量" value={fmtVec(value, 4)} mono accent="amber" />
      <FieldRow label="模长" value={fmt(len(value), 4)} accent="cyan" />
    </Modal>
  );
}

function ArrowGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 16 16 4M9 4h7v7" />
    </svg>
  );
}

function ScalarDialog() {
  const close = () => useApp.getState().setDialog(null);
  const [lambda, setLambda] = useState(2);
  return (
    <Modal
      title="向量数乘 λa"
      subtitle="将选中向量按标量 λ 缩放，方向由 λ 的符号决定"
      icon={<span className="math-icon">λ</span>}
      onClose={close}
      footer={
        <FooterButtons
          onCancel={close}
          submitLabel="计算结果"
          onSubmit={() => {
            useApp.getState().vectorOp('scalar', lambda);
            close();
          }}
        />
      }
    >
      <div className="scalar-visual">
        <span>λ =</span>
        <input type="number" value={lambda} step={0.25} onChange={(e) => setLambda(Number(e.target.value))} />
      </div>
      <div className="modal-note">λ &gt; 1 伸长，0 &lt; λ &lt; 1 缩短，λ &lt; 0 反向。结果会显示在「向量」面板中。</div>
    </Modal>
  );
}

function ExtrudeDialog({ points, normal }: { points: Vec3[]; normal: Vec3 }) {
  const close = () => useApp.getState().setDialog(null);
  const [height, setHeight] = useState(2);
  return (
    <Modal
      title="由面拉伸成体"
      subtitle="沿平面法向量拉伸选中的多边形，生成棱柱状几何体"
      icon={<Layers size={18} />}
      onClose={close}
      footer={
        <FooterButtons
          onCancel={close}
          submitLabel="生成几何体"
          disabled={height === 0}
          onSubmit={() => useApp.getState().createExtrude(height)}
        />
      }
    >
      <div className="form-grid">
        <NumberField label="拉伸高度（可正可负）" value={height} step={0.1} onChange={setHeight} />
      </div>
      <FieldRow label="底面多边形" value={`${points.length} 个顶点`} />
      <FieldRow label="拉伸方向" value={fmtVec(normal, 5)} mono />
      <div className="modal-note">共 {points.length} 个顶点将被复制并沿法向平移。生成后可以继续拖动顶点。</div>
    </Modal>
  );
}

function SectionDialog({ initialSolidId }: { initialSolidId?: string }) {
  const close = () => useApp.getState().setDialog(null);
  const entities = useApp((s) => s.entities);
  const solids = entities.filter((e) => e.type === 'solid');
  const planes = entities.filter((e) => e.type === 'plane');
  const [solidId, setSolidId] = useState(initialSolidId ?? solids[0]?.id ?? '');
  const [planeId, setPlaneId] = useState(planes[0]?.id ?? '');
  const [mode, setMode] = useState<'plane' | 'axis'>(planes.length ? 'plane' : 'axis');
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('z');
  const [offset, setOffset] = useState(1);
  const [clip, setClip] = useState(false);
  const can = Boolean(solidId) && (mode === 'plane' ? Boolean(planeId) : true);
  return (
    <Modal
      title="生成截面 / 切割"
      subtitle="用平面裁切几何体，高亮显示截痕并生成可导出的截面多边形"
      icon={<Scissors size={18} />}
      onClose={close}
      footer={
        <FooterButtons
          onCancel={close}
          submitLabel="生成截面"
          disabled={!can}
          onSubmit={() => {
            if (!solidId) return;
            if (mode === 'plane' && planeId) useApp.getState().createSection(solidId, planeId, { clip, fill: true });
            else useApp.getState().createAxisSection(solidId, axis, offset, { clip, fill: true });
            close();
          }}
        />
      }
    >
      <SectionLabel>目标立体</SectionLabel>
      <select className="select-input" value={solidId} onChange={(e) => setSolidId(e.target.value)}>
        <option value="">选择立体…</option>
        {solids.map((s) => <option key={s.id} value={s.id}>{s.name} · {entityDisplayType(s)}</option>)}
      </select>
      <SectionLabel>切割平面</SectionLabel>
      <div className="segmented full">
        <button type="button" className={mode === 'plane' ? 'is-active' : ''} onClick={() => setMode('plane')} disabled={!planes.length}>
          使用场景平面
        </button>
        <button type="button" className={mode === 'axis' ? 'is-active' : ''} onClick={() => setMode('axis')}>
          轴向平面
        </button>
      </div>
      {mode === 'plane' ? (
        planes.length ? (
          <select className="select-input" value={planeId} onChange={(e) => setPlaneId(e.target.value)}>
            {planes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <div className="info-card warn">场景中还没有平面。请先在「创建」面板建立三点平面，或使用轴向平面。</div>
        )
      ) : (
        <>
          <div className="segmented full">
            {(['x', 'y', 'z'] as const).map((a) => (
              <button type="button" key={a} className={axis === a ? 'is-active' : ''} onClick={() => setAxis(a)}>
                垂直于 {a.toUpperCase()} 轴
              </button>
            ))}
          </div>
          <NumberField label="平面偏移量" value={offset} step={0.1} onChange={setOffset} />
        </>
      )}
      <div className="modal-switch">
        <Switch label="开启剖切显示（裁掉平面一侧）" checked={clip} onChange={setClip} />
      </div>
      {!solids.length ? <div className="modal-note warn">场景中没有立体，请先创建几何体。</div> : null}
    </Modal>
  );
}

function HelpDialog({ page }: { page: 'guide' | 'shortcuts' | 'about' }) {
  const close = () => useApp.getState().setDialog(null);
  const groups = useMemo(() => {
    const map = new Map<string, typeof SHORTCUTS>();
    for (const s of SHORTCUTS) {
      const list = map.get(s.group) ?? [];
      list.push(s);
      map.set(s.group, list);
    }
    return [...map.entries()];
  }, []);
  if (page === 'about') {
    return (
      <Modal
        title="关于 SolidGeo"
        subtitle="面向高中立体几何教学的 Windows 11 四视口三维建模软件"
        icon={<Sparkles size={18} />}
        onClose={close}
        footer={<button type="button" className="primary-button" onClick={close}>开始探索</button>}
        wide
      >
        <div className="about-grid">
          <div className="about-brand">
            <div className="about-logo">S</div>
            <div>
              <h3>SolidGeo <span>v2.0.0</span></h3>
              <p>立体几何实验室</p>
            </div>
          </div>
          <p className="about-desc">
            SolidGeo 将几何建模、自动关系判定、实时度量、空间向量与截面切割整合到四个同步视口中。
            所有运算在本地完成，工程以 .geojson 保存，支持 PNG / SVG / OBJ 导出。
          </p>
          <div className="about-features">
            <span>四视口同步</span><span>参数化几何体</span><span>拖拽顶点</span><span>实虚隐线</span>
            <span>截面 / 剖切</span><span>向量法步骤</span><span>动画演示</span><span>离线可用</span>
          </div>
          <div className="about-meta">
            <span>技术栈 Electron · React · Three.js · TypeScript</span>
            <span>© 2026 SolidGeo · 仅供教学使用</span>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal
      title={page === 'shortcuts' ? '快捷键列表' : '使用说明'}
      subtitle={page === 'shortcuts' ? '高效使用 SolidGeo 的键盘与鼠标操作' : '五步完成一个立体几何探究'}
      icon={page === 'shortcuts' ? <Keyboard size={18} /> : <Info size={18} />}
      onClose={close}
      wide
      footer={<button type="button" className="primary-button" onClick={close}>知道了</button>}
    >
      {page === 'shortcuts' ? (
        <div className="shortcut-groups">
          {groups.map(([group, items]) => (
            <div className="shortcut-group" key={group}>
              <h4>{group}</h4>
              {items.map((item) => (
                <div className="shortcut-row" key={item.keys + item.description}>
                  <span>{item.description}</span>
                  <kbd>{item.keys}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="guide-list">
          {GUIDE_STEPS.map((step, i) => (
            <div className="guide-step" key={step.title}>
              <span className="guide-index">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h4>{step.title}</h4>
                <p>{step.detail}</p>
              </div>
            </div>
          ))}
          <div className="guide-tip">
            <Info size={16} />
            <p>提示：按住 Ctrl 多选是关系判定与向量运算的关键；选择模式「面」用于截面、二面角和由面构体。</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NewConfirmDialog() {
  const close = () => useApp.getState().setDialog(null);
  return (
    <Modal
      title="新建场景"
      subtitle="当前场景有未保存的修改"
      icon={<Info size={18} />}
      onClose={close}
      footer={
        <>
          <button type="button" className="ghost-button" onClick={close}>取消</button>
          <button
            type="button"
            className="primary-button"
            onClick={async () => {
              const ok = await saveProject();
              if (ok) {
                useApp.getState().newProject();
                close();
              }
            }}
          >
            保存后新建
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              useApp.getState().newProject();
              close();
            }}
          >
            放弃并新建
          </button>
        </>
      }
    >
      <p className="modal-paragraph">是否先保存当前工程？放弃修改后仍可在本次会话中使用撤销恢复最近一步，但关闭程序后无法恢复。</p>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'point':
      return <PointDialog />;
    case 'solid':
      return <SolidDialog solidType={dialog.solidType} key={dialog.solidType} />;
    case 'circle':
      return <CircleDialog />;
    case 'vector':
      return <VectorDialog />;
    case 'vector-scalar':
      return <ScalarDialog />;
    case 'extrude':
      return <ExtrudeDialog points={dialog.points} normal={dialog.normal} />;
    case 'section':
      return <SectionDialog initialSolidId={dialog.solidId} />;
    case 'help':
      return <HelpDialog page={dialog.page} />;
    case 'new-confirm':
      return <NewConfirmDialog />;
    default:
      return null;
  }
}
