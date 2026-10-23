import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { SolidType } from '../core/types';
import { solidDisplayName } from '../core/entities';
import { useApp } from '../store/useApp';
import { getViewportController } from '../render/viewportController';
import {
  exportOBJ,
  exportPNG,
  exportSVG,
  newProject,
  openProject,
  saveProject,
} from '../lib/sceneActions';
import { SHORTCUTS } from '../lib/shortcuts';

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  hint?: string;
}

interface MenuGroup {
  key: string;
  label: string;
  items: MenuItem[];
}

const SOLIDS: SolidType[] = ['cube', 'cuboid', 'prism', 'pyramid', 'cylinder', 'cone', 'sphere', 'tetra'];

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const theme = useApp((s) => s.settings.theme);
  const pastLength = useApp((s) => s.past.length);
  const futureLength = useApp((s) => s.future.length);
  const selectionLength = useApp((s) => s.selection.length);
  const entityCount = useApp((s) => s.entities.length);
  const projection = useApp((s) => s.camera.projection);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const setDialog = useApp((s) => s.setDialog);
  const setActiveTool = useApp((s) => s.setActiveTool);
  const selectionMode = useApp((s) => s.selectionMode);
  const setSelectionMode = useApp((s) => s.setSelectionMode);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const st = () => useApp.getState();
  const run = (action?: () => void) => {
    setOpen(null);
    action?.();
  };
  const controller = () => getViewportController();

  const menus: MenuGroup[] = [
    {
      key: 'file',
      label: '文件',
      items: [
        { label: '新建场景', shortcut: 'Ctrl+N', action: newProject },
        { label: '打开工程…', shortcut: 'Ctrl+O', action: () => void openProject() },
        { label: '保存工程 (.geojson)', shortcut: 'Ctrl+S', action: () => void saveProject() },
        { separator: true },
        { label: '导出当前视图 PNG (2×)', action: () => void exportPNG() },
        { label: '导出当前视图 SVG', action: () => void exportSVG() },
        { label: '导出场景 OBJ', action: () => void exportOBJ() },
        { separator: true },
        {
          label: '退出',
          action: () => {
            if (window.solidgeo) void window.solidgeo.close();
            else window.close();
          },
        },
      ],
    },
    {
      key: 'edit',
      label: '编辑',
      items: [
        { label: '撤销', shortcut: 'Ctrl+Z', action: () => st().undo(), disabled: pastLength === 0 },
        { label: '重做', shortcut: 'Ctrl+Y', action: () => st().redo(), disabled: futureLength === 0 },
        { separator: true },
        { label: '删除选中', shortcut: 'Del', action: () => st().deleteSelected(), disabled: selectionLength === 0 },
        {
          label: '清空场景',
          action: () => {
            if (window.confirm('确定清空当前场景？此操作可以使用 Ctrl+Z 撤销。')) st().clearScene();
          },
          disabled: entityCount === 0,
        },
        { separator: true },
        { label: '选择模式：整体', checked: selectionMode === 'entity', action: () => setSelectionMode('entity') },
        { label: '选择模式：顶点', checked: selectionMode === 'vertex', action: () => setSelectionMode('vertex') },
        { label: '选择模式：面', checked: selectionMode === 'face', action: () => setSelectionMode('face') },
      ],
    },
    {
      key: 'create',
      label: '创建',
      items: [
        { label: '点（视口拾取）', action: () => setActiveTool('point') },
        { label: '输入坐标建点…', action: () => setDialog({ kind: 'point' }) },
        { label: '线段', action: () => setActiveTool('segment') },
        { label: '直线', action: () => setActiveTool('line') },
        { label: '平面（三点）', action: () => setActiveTool('plane') },
        { label: '圆 / 圆弧…', action: () => setDialog({ kind: 'circle' }) },
        { separator: true },
        ...SOLIDS.map((type) => ({
          label: solidDisplayName(st().entities, type).replace(/\s\d+$/, ''),
          action: () => setDialog({ kind: 'solid', solidType: type }),
        })),
      ],
    },
    {
      key: 'construct',
      label: '构造',
      items: [
        { label: '中点', action: () => st().constructMidpoint(), disabled: selectionLength < 1 },
        { label: '交点 / 交线', action: () => st().constructIntersection(), disabled: selectionLength < 2 },
        { label: '垂足', action: () => st().constructFoot(), disabled: selectionLength < 2 },
        { label: '投影点', action: () => st().constructProjection(), disabled: selectionLength < 2 },
        { separator: true },
        { label: '过三点建面', action: () => st().constructPlaneThree(), disabled: selectionLength !== 3 },
        { label: '过线点建面', action: () => st().constructPlaneLinePoint(), disabled: selectionLength !== 2 },
        { label: '由面拉伸成体…', action: () => st().prepareExtrude(), disabled: selectionLength < 1 },
        { separator: true },
        { label: '生成截面 / 切割…', action: () => st().openSection(), disabled: selectionLength < 1 },
      ],
    },
    {
      key: 'measure',
      label: '度量',
      items: [
        { label: '长度（线段 / 弧长）', action: () => st().measure('length') },
        { label: '两线夹角 / 三点角', action: () => st().measure('angle') },
        { label: '线面角', action: () => st().measure('linePlaneAngle') },
        { label: '二面角', action: () => st().measure('dihedral') },
        { label: '异面直线所成角', action: () => st().measure('skewAngle') },
        { label: '点到平面距离', action: () => st().measure('pointPlaneDistance') },
        { separator: true },
        { label: '表面积', action: () => st().measure('surfaceArea') },
        { label: '体积', action: () => st().measure('volume') },
        { separator: true },
        { label: '刷新选中图元的全部度量', action: () => st().measureSelection() },
      ],
    },
    {
      key: 'vector',
      label: '向量',
      items: [
        { label: '添加向量…', action: () => st().createVectorFromSelection() },
        { separator: true },
        {
          label: '加法 a + b',
          action: () => st().vectorOp('add'),
        },
        { label: '减法 a − b', action: () => st().vectorOp('sub') },
        { label: '数乘 λa…', action: () => setDialog({ kind: 'vector-scalar' }) },
        { label: '点积 a · b', action: () => st().vectorOp('dot') },
        { label: '叉积 a × b', action: () => st().vectorOp('cross') },
        { separator: true },
        { label: '模长 / 单位向量', action: () => st().vectorOp('magnitude') },
        { label: '两向量夹角', action: () => st().vectorOp('angle') },
        { label: '投影向量', action: () => st().vectorOp('projection') },
        { separator: true },
        { label: '向量法求线面角', action: () => st().showVectorSteps('linePlane') },
        { label: '向量法求二面角', action: () => st().showVectorSteps('dihedral') },
      ],
    },
    {
      key: 'view',
      label: '视图',
      items: [
        {
          label: projection === 'perspective' ? '切换主视口为：正交' : '切换主视口为：透视',
          shortcut: '',
          action: () => controller()?.toggleMainProjection(),
        },
        { label: '显示坐标轴', checked: settings.showAxes, action: () => setSettings({ showAxes: !settings.showAxes }) },
        { label: '显示网格', checked: settings.showGrid, action: () => setSettings({ showGrid: !settings.showGrid }) },
        { label: '显示虚隐线', checked: settings.showHidden, action: () => setSettings({ showHidden: !settings.showHidden }) },
        { label: '线框模式', shortcut: 'W', checked: settings.wireframe, action: () => setSettings({ wireframe: !settings.wireframe }) },
        { label: '顶点标注', checked: settings.showLabels, action: () => setSettings({ showLabels: !settings.showLabels }) },
        { label: '视图联动', checked: settings.linked, action: () => setSettings({ linked: !settings.linked }) },
        { separator: true },
        { label: '自动旋转演示', shortcut: 'R', checked: settings.autoRotate, action: () => setSettings({ autoRotate: !settings.autoRotate }) },
        { label: '适合全部', shortcut: 'F', action: () => controller()?.fitAll() },
        { label: '聚焦选中', shortcut: 'Shift+F', action: () => controller()?.fitSelection() },
        { label: '重置视角', action: () => controller()?.resetViews() },
        { separator: true },
        {
          label: '浅色 / 深色主题',
          action: () => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' }),
        },
      ],
    },
    {
      key: 'help',
      label: '帮助',
      items: [
        { label: '快捷键列表', action: () => setDialog({ kind: 'help', page: 'shortcuts' }) },
        { label: '使用说明', action: () => setDialog({ kind: 'help', page: 'guide' }) },
        { separator: true },
        { label: '关于 SolidGeo', action: () => setDialog({ kind: 'help', page: 'about' }) },
      ],
    },
  ];

  return (
    <div className="menubar" ref={wrapRef}>
      <div className="menu-brand-pill">
        <span className="menu-brand-dot" />
        <span>高中立体几何 · 四视口建模</span>
      </div>
      <nav className="menu-list" aria-label="主菜单">
        {menus.map((menu) => (
          <div
            className={`menu-wrap ${open === menu.key ? 'is-open' : ''}`}
            key={menu.key}
            onMouseEnter={() => open && setOpen(menu.key)}
          >
            <button
              type="button"
              className={`menu-trigger ${open === menu.key ? 'is-open' : ''}`}
              onClick={() => setOpen(open === menu.key ? null : menu.key)}
            >
              {menu.label}
            </button>
            {open === menu.key ? (
              <div className="menu-dropdown" role="menu">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div className="menu-sep" key={`sep-${i}`} />
                  ) : (
                    <button
                      type="button"
                      className={`menu-item ${item.disabled ? 'is-disabled' : ''}`}
                      key={`${item.label}-${i}`}
                      disabled={item.disabled}
                      onClick={() => run(item.action)}
                    >
                      <span className="menu-check">{item.checked ? <Check size={13} /> : null}</span>
                      <span className="menu-label">{item.label}</span>
                      {item.shortcut ? <span className="menu-shortcut">{item.shortcut}</span> : null}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
      <div className="menu-hints">
        <span><kbd>R</kbd> 旋转</span>
        <span><kbd>W</kbd> 线框</span>
        <span><kbd>Ctrl</kbd>+<kbd>S</kbd> 保存</span>
      </div>
    </div>
  );
}

export { SHORTCUTS };
