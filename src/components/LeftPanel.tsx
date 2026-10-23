import React from 'react';
import {
  Activity,
  ArrowUpRight,
  Box,
  Circle,
  Cone,
  Crosshair,
  Cylinder,
  Dot,
  Eye,
  EyeOff,
  Globe,
  Layers,
  Minus,
  MoveRight,
  Palette,
  Scissors,
  Slash,
  Sparkles,
  Square,
  Triangle,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { SolidType } from '../core/types';
import {
  entityDisplayType,
  makePlane,
  makeSection,
  nextEntityName,
} from '../core/entities';
import { norm } from '../core/math';
import { useApp, type LeftTab } from '../store/useApp';
import { getViewportController } from '../render/viewportController';
import { confirmDiscard } from '../lib/sceneActions';
import { EmptyHint, IconButton, SectionLabel, SolidGlyph } from './common';

const SOLID_BUTTONS: Array<{ type: SolidType; label: string; tone: string }> = [
  { type: 'cube', label: '正方体', tone: 'cyan' },
  { type: 'cuboid', label: '长方体', tone: 'blue' },
  { type: 'prism', label: '棱柱', tone: 'violet' },
  { type: 'pyramid', label: '棱锥', tone: 'pink' },
  { type: 'cylinder', label: '圆柱', tone: 'teal' },
  { type: 'cone', label: '圆锥', tone: 'amber' },
  { type: 'sphere', label: '球', tone: 'sky' },
  { type: 'tetra', label: '四面体', tone: 'rose' },
];

function tabButton(tab: LeftTab, current: LeftTab, setter: (t: LeftTab) => void, label: string) {
  return (
    <button type="button" className={`panel-tab ${tab === current ? 'is-active' : ''}`} onClick={() => setter(tab)}>
      {label}
    </button>
  );
}

function ToolTile({
  active,
  icon,
  title,
  hint,
  onClick,
}: {
  active?: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`tool-tile ${active ? 'is-active' : ''}`} onClick={onClick}>
      <span className="tool-icon">{icon}</span>
      <span className="tool-copy">
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
    </button>
  );
}

function ConstructTile({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="construct-tile" onClick={onClick}>
      <span className="construct-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
    </button>
  );
}

function demoScene() {
  if (!confirmDiscard()) return;
  const s = useApp.getState();
  s.newProject();
  s.createSolid('cube', { size: 2.4, cx: 0, cy: 0, cz: 0 });
  const after = useApp.getState();
  const cube = after.entities.find((e) => e.type === 'solid' && e.solidType === 'cube');
  if (!cube || cube.type !== 'solid') return;
  after.createVector([-2.9, -2.8, 3.1], [2.6, 0, 0]);
  const planeDef = {
    kind: 'free' as const,
    point: [0, 0, 1.2] as [number, number, number],
    normal: norm([0.86, 0.64, 0.12]) as [number, number, number],
  };
  const state = useApp.getState();
  const plane = makePlane(state.entities, planeDef, { color: '#fcd34d', size: 4.4 });
  const section = makeSection([...state.entities, plane], cube.id, planeDef, { clip: false, fill: true });
  useApp.getState().addEntities([plane, section], '添加示例截面', [{ id: cube.id }]);
  useApp.getState().setDocName('立体几何示例');
  useApp.setState({ toasts: [], dirty: true });
  setTimeout(() => getViewportController()?.fitAll(), 60);
  useApp.getState().toast('示例场景已生成：正方体 + 截面 + 向量', 'success');
}

function CreateTab() {
  const activeTool = useApp((s) => s.activeTool);
  const setActiveTool = useApp((s) => s.setActiveTool);
  const setDialog = useApp((s) => s.setDialog);
  const entities = useApp((s) => s.entities);
  const toggle = (tool: 'point' | 'segment' | 'line' | 'plane') => {
    setActiveTool(activeTool === tool ? 'select' : tool);
  };
  return (
    <div className="panel-scroll">
      <SectionLabel
        action={
          <button type="button" className="section-link" onClick={() => setDialog({ kind: 'point' })}>
            输入坐标…
          </button>
        }
      >
        基础图元
      </SectionLabel>
      <div className="tool-list">
        <ToolTile
          active={activeTool === 'point'}
          icon={<Dot size={18} />}
          title="点"
          hint="点击地面或表面落点"
          onClick={() => toggle('point')}
        />
        <ToolTile
          active={activeTool === 'segment'}
          icon={<Slash size={18} />}
          title="线段"
          hint="依次点击两个点"
          onClick={() => toggle('segment')}
        />
        <ToolTile
          active={activeTool === 'line'}
          icon={<MoveRight size={18} />}
          title="直线"
          hint="两点确定一条直线"
          onClick={() => toggle('line')}
        />
        <ToolTile
          active={activeTool === 'plane'}
          icon={<Square size={18} />}
          title="平面"
          hint="依次点击三个点"
          onClick={() => toggle('plane')}
        />
      </div>

      <SectionLabel>曲线与向量</SectionLabel>
      <div className="split-buttons">
        <button type="button" className="soft-button" onClick={() => setDialog({ kind: 'circle' })}>
          <Circle size={16} />
          <span>圆 / 圆弧</span>
        </button>
        <button type="button" className="soft-button" onClick={() => useApp.getState().createVectorFromSelection()}>
          <ArrowUpRight size={16} />
          <span>空间向量</span>
        </button>
      </div>

      <SectionLabel action={<span className="section-meta">参数化</span>}>几何体</SectionLabel>
      <div className="solid-grid">
        {SOLID_BUTTONS.map((item) => (
          <button
            type="button"
            className={`solid-tile tone-${item.tone}`}
            key={item.type}
            onClick={() => setDialog({ kind: 'solid', solidType: item.type })}
          >
            <SolidGlyph type={item.type} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="panel-note">
        <Sparkles size={15} />
        <p>所有几何体参数可调；拖动白色顶点可以实时变形，并联动刷新度量。</p>
      </div>

      <button type="button" className="demo-button" onClick={demoScene}>
        <Wand2 size={16} />
        <span>载入示例场景</span>
        <em>{entities.length ? '替换当前场景' : '正方体 · 截面 · 向量'}</em>
      </button>
    </div>
  );
}

function ConstructTab() {
  const selection = useApp((s) => s.selection);
  const selectionMode = useApp((s) => s.selectionMode);
  const state = useApp.getState;
  return (
    <div className="panel-scroll">
      <SectionLabel action={<span className="section-meta">{selection.length} 项选中</span>}>构造</SectionLabel>
      <div className="construct-list">
        <ConstructTile icon={<Crosshair size={17} />} title="中点" hint="两点或一条线段的中点" onClick={() => state().constructMidpoint()} />
        <ConstructTile icon={<Scissors size={17} />} title="交点 / 交线" hint="两线、线面、两平面" onClick={() => state().constructIntersection()} />
        <ConstructTile icon={<MoveRight size={17} />} title="垂足" hint="点到直线或平面的垂足" onClick={() => state().constructFoot()} />
        <ConstructTile icon={<Layers size={17} />} title="投影点" hint="点沿法向投影到平面" onClick={() => state().constructProjection()} />
        <ConstructTile icon={<Square size={17} />} title="过三点建面" hint="选中三个不共线点" onClick={() => state().constructPlaneThree()} />
        <ConstructTile icon={<Minus size={17} />} title="过线点建面" hint="一条直线 + 一个线外点" onClick={() => state().constructPlaneLinePoint()} />
        <ConstructTile icon={<Box size={17} />} title="由面拉伸成体" hint="选中一个面或三点" onClick={() => state().prepareExtrude()} />
        <ConstructTile icon={<Palette size={17} />} title="截面 / 切割" hint="立体 + 平面，生成截痕" onClick={() => state().openSection()} />
      </div>

      <SectionLabel>选择提示</SectionLabel>
      <div className="info-card">
        <p>
          当前选择模式：<strong>{selectionMode === 'entity' ? '整体' : selectionMode === 'vertex' ? '顶点' : '面'}</strong>
        </p>
        <p>按住 <kbd>Ctrl</kbd> 点击可以多选；使用视口上方工具栏切换「整体 / 顶点 / 面」。</p>
      </div>

      <div className="construct-chips">
        <button type="button" className="soft-button" onClick={() => state().showVectorSteps('linePlane')}>
          向量法 · 线面角
        </button>
        <button type="button" className="soft-button" onClick={() => state().showVectorSteps('dihedral')}>
          向量法 · 二面角
        </button>
      </div>
    </div>
  );
}

function entityIcon(entity: ReturnType<typeof useApp.getState>['entities'][number]) {
  switch (entity.type) {
    case 'point':
      return <Dot size={15} />;
    case 'segment':
      return <Minus size={15} />;
    case 'line':
      return <MoveRight size={15} />;
    case 'plane':
      return <Square size={15} />;
    case 'circle':
      return <Circle size={15} />;
    case 'vector':
      return <ArrowUpRight size={15} />;
    case 'solid':
      return <Box size={15} />;
    case 'section':
      return <Scissors size={15} />;
    case 'trail':
      return <Activity size={15} />;
  }
}

function SceneTab() {
  const entities = useApp((s) => s.entities);
  const selection = useApp((s) => s.selection);
  const selectRef = useApp((s) => s.selectRef);
  const clearSelection = useApp((s) => s.clearSelection);
  const toggleVisibility = useApp((s) => s.toggleVisibility);
  return (
    <div className="panel-scroll">
      <SectionLabel action={<span className="section-meta">{entities.length} 个图元</span>}>场景图元</SectionLabel>
      {entities.length === 0 ? (
        <EmptyHint icon={<Box size={30} />} title="场景还是空的" detail="从「创建」面板添加点、线、面或几何体，也可以载入示例场景。" />
      ) : (
        <div className="scene-list">
          {entities.map((entity) => {
            const selected = selection.some((s) => s.id === entity.id);
            return (
              <div
                key={entity.id}
                className={`scene-row ${selected ? 'is-selected' : ''} ${entity.visible ? '' : 'is-hidden'}`}
                onClick={(e) => selectRef({ id: entity.id }, e.ctrlKey || e.metaKey || e.shiftKey)}
                onDoubleClick={() => {
                  selectRef({ id: entity.id }, false);
                  setTimeout(() => getViewportController()?.fitSelection(), 30);
                }}
              >
                <span className="scene-color" style={{ background: entity.color }} />
                <span className="scene-type-icon">{entityIcon(entity)}</span>
                <span className="scene-copy">
                  <strong>{entity.name}</strong>
                  <small>{entityDisplayType(entity)}</small>
                </span>
                <IconButton
                  title={entity.visible ? '隐藏' : '显示'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisibility(entity.id);
                  }}
                >
                  {entity.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </IconButton>
              </div>
            );
          })}
        </div>
      )}
      {entities.length > 0 ? (
        <div className="scene-actions">
          <button type="button" className="soft-button" onClick={clearSelection}>
            取消选择
          </button>
          <button
            type="button"
            className="soft-button danger"
            onClick={() => {
              if (window.confirm('确定清空场景？可以使用 Ctrl+Z 撤销。')) useApp.getState().clearScene();
            }}
          >
            <Trash2 size={14} /> 清空
          </button>
        </div>
      ) : null}
      <div className="panel-note">
        <Layers size={15} />
        <p>点击图元名称可在视口中高亮；双击定位到该图元。删除实体前请确保选择模式为「整体」。</p>
      </div>
    </div>
  );
}

export function LeftPanel() {
  const leftTab = useApp((s) => s.leftTab);
  const setLeftTab = useApp((s) => s.setLeftTab);
  return (
    <aside className="side-panel left-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-eyebrow">BUILD</span>
          <h2>图元与构造</h2>
        </div>
        <span className="panel-accent" />
      </div>
      <div className="panel-tabs">
        {tabButton('create', leftTab, setLeftTab, '创建')}
        {tabButton('construct', leftTab, setLeftTab, '构造')}
        {tabButton('scene', leftTab, setLeftTab, '场景')}
      </div>
      {leftTab === 'create' ? <CreateTab /> : leftTab === 'construct' ? <ConstructTab /> : <SceneTab />}
    </aside>
  );
}
