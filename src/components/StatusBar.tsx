import { useApp } from '../store/useApp';
import { fmt } from '../core/math';

const TOOL_HINT: Record<string, string> = {
  select: '左键选择 · Ctrl 点击多选 · 拖动顶点变形 · 主视口左键拖拽旋转',
  point: '点击地面或物体表面创建点 · Esc 退出点工具',
  segment: '依次点击两个点创建线段；点击空白处会自动创建点 · Esc 退出',
  line: '依次点击两个点创建直线 · Esc 退出',
  plane: '依次点击三个不共线的点创建平面 · Esc 退出',
};

const VIEW_NAME: Record<string, string> = {
  perspective: '透视主视口',
  top: '俯视图',
  front: '正视图',
  left: '左视图',
};

export function StatusBar() {
  const mouse = useApp((s) => s.mouseWorld);
  const hover = useApp((s) => s.hoverLabel);
  const tool = useApp((s) => s.activeTool);
  const pending = useApp((s) => s.pendingAnchors.length);
  const entities = useApp((s) => s.entities.length);
  const selection = useApp((s) => s.selection.length);
  const mode = useApp((s) => s.selectionMode);
  const view = useApp((s) => s.activeViewport);
  const linked = useApp((s) => s.settings.linked);
  const autoRotate = useApp((s) => s.settings.autoRotate);
  const hint = TOOL_HINT[tool] ?? TOOL_HINT.select;

  return (
    <footer className="statusbar">
      <div className="status-hint">
        <span className="status-pulse" />
        <span>{hint}</span>
        {pending > 0 ? <span className="status-pending">待选 {pending} 点</span> : null}
        {hover ? <span className="status-hover">悬停：{hover}</span> : null}
      </div>
      <div className="status-spacer" />
      <div className="status-chips">
        <span className="status-chip">模式 <strong>{mode === 'entity' ? '整体' : mode === 'vertex' ? '顶点' : '面'}</strong></span>
        <span className="status-chip">视图 <strong>{VIEW_NAME[view]}</strong></span>
        <span className={`status-chip ${linked ? 'is-on' : ''}`}>{linked ? '联动' : '独立'}</span>
        <span className={`status-chip ${autoRotate ? 'is-on' : ''}`}>{autoRotate ? '旋转中' : '静止'}</span>
      </div>
      <div className="coordinate-readout" title="鼠标所在三维坐标">
        <span className="coord x"><em>X</em>{mouse ? fmt(mouse[0], 3) : '—'}</span>
        <span className="coord y"><em>Y</em>{mouse ? fmt(mouse[1], 3) : '—'}</span>
        <span className="coord z"><em>Z</em>{mouse ? fmt(mouse[2], 3) : '—'}</span>
      </div>
      <div className="status-counts">
        <span>{entities} 图元</span>
        <span>{selection} 选中</span>
      </div>
    </footer>
  );
}
