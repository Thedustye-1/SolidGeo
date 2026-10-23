import { useEffect, useRef, useState } from 'react';
import {
  Box,
  BoxSelect,
  Circle,
  Dot,
  Eye,
  EyeOff,
  Focus,
  Grid3X3,
  Link2,
  Link2Off,
  MousePointer2,
  MoveRight,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  ScanLine,
  Slash,
  Square,
  Undo2,
} from 'lucide-react';
import { useApp } from '../store/useApp';
import { ViewportEngine } from '../render/engine';
import { getViewportController } from '../render/viewportController';
import { IconButton } from './common';

const VIEW_META = {
  perspective: { title: '透视主视口', sub: '自由旋转', badge: 'PERSPECTIVE', hint: '左键旋转 · 滚轮缩放 · 右键平移' },
  top: { title: '俯视图', sub: '正交投影', badge: 'TOP · ORTHO', hint: '左键拖拽平移 · 滚轮缩放' },
  front: { title: '正视图', sub: '正交投影', badge: 'FRONT · ORTHO', hint: '左键拖拽平移 · 滚轮缩放' },
  left: { title: '左视图', sub: '正交投影', badge: 'LEFT · ORTHO', hint: '左键拖拽平移 · 滚轮缩放' },
} as const;

function StageToolbar() {
  const activeTool = useApp((s) => s.activeTool);
  const setActiveTool = useApp((s) => s.setActiveTool);
  const selectionMode = useApp((s) => s.selectionMode);
  const setSelectionMode = useApp((s) => s.setSelectionMode);
  const linked = useApp((s) => s.settings.linked);
  const autoRotate = useApp((s) => s.settings.autoRotate);
  const wireframe = useApp((s) => s.settings.wireframe);
  const showHidden = useApp((s) => s.settings.showHidden);
  const setSettings = useApp((s) => s.setSettings);
  const projection = useApp((s) => s.camera.projection);
  const pastLength = useApp((s) => s.past.length);
  const futureLength = useApp((s) => s.future.length);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const ctl = () => getViewportController();

  const tool = (value: 'select' | 'point' | 'segment' | 'line' | 'plane', icon: React.ReactNode, title: string) => {
    const active = activeTool === value;
    return (
      <IconButton
        title={title}
        active={active}
        onClick={() => setActiveTool(active ? 'select' : value)}
      >
        {icon}
      </IconButton>
    );
  };

  return (
    <div className="stage-toolbar">
      <div className="toolbar-group">
        <div className="segmented tiny" role="group" aria-label="选择模式">
          <button type="button" className={selectionMode === 'entity' ? 'is-active' : ''} onClick={() => setSelectionMode('entity')} title="整体选择">
            <BoxSelect size={14} /><span>整体</span>
          </button>
          <button type="button" className={selectionMode === 'vertex' ? 'is-active' : ''} onClick={() => setSelectionMode('vertex')} title="顶点选择">
            <Dot size={14} /><span>顶点</span>
          </button>
          <button type="button" className={selectionMode === 'face' ? 'is-active' : ''} onClick={() => setSelectionMode('face')} title="面选择">
            <Square size={14} /><span>面</span>
          </button>
        </div>
        <span className="toolbar-sep" />
        {tool('select', <MousePointer2 size={16} />, '选择工具 (Esc)')}
        {tool('point', <Dot size={16} />, '点工具 (P)')}
        {tool('segment', <Slash size={16} />, '线段工具 (S)')}
        {tool('line', <MoveRight size={16} />, '直线工具 (L)')}
        {tool('plane', <Square size={16} />, '平面工具 (N)')}
        <IconButton title="圆 / 圆弧" onClick={() => useApp.getState().setDialog({ kind: 'circle' })}>
          <Circle size={16} />
        </IconButton>
        <IconButton title="创建立方体" onClick={() => useApp.getState().setDialog({ kind: 'solid', solidType: 'cube' })}>
          <Box size={16} />
        </IconButton>
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-group">
        <IconButton title="撤销 (Ctrl+Z)" onClick={undo} disabled={!pastLength}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton title="重做 (Ctrl+Y)" onClick={redo} disabled={!futureLength}>
          <Redo2 size={16} />
        </IconButton>
        <span className="toolbar-sep" />
        <IconButton title="适合全部 (F)" onClick={() => ctl()?.fitAll()}>
          <Focus size={16} />
        </IconButton>
        <IconButton title="重置视角" onClick={() => ctl()?.resetViews()}>
          <RotateCcw size={16} />
        </IconButton>
        <button
          type="button"
          className={`toolbar-pill ${projection === 'perspective' ? 'is-on' : ''}`}
          title="切换主视口透视 / 正交"
          onClick={() => ctl()?.toggleMainProjection()}
        >
          <ScanLine size={14} />
          <span>{projection === 'perspective' ? '透视' : '正交'}</span>
        </button>
        <IconButton title={linked ? '视图联动：开' : '视图联动：关'} active={linked} onClick={() => setSettings({ linked: !linked })}>
          {linked ? <Link2 size={16} /> : <Link2Off size={16} />}
        </IconButton>
        <IconButton title={autoRotate ? '停止自动旋转 (R)' : '自动旋转 (R)'} active={autoRotate} onClick={() => setSettings({ autoRotate: !autoRotate })}>
          {autoRotate ? <Pause size={16} /> : <Play size={16} />}
        </IconButton>
        <IconButton title="线框模式 (W)" active={wireframe} onClick={() => setSettings({ wireframe: !wireframe })}>
          <Grid3X3 size={16} />
        </IconButton>
        <IconButton title="显示 / 隐藏虚隐线" active={showHidden} onClick={() => setSettings({ showHidden: !showHidden })}>
          {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
        </IconButton>
      </div>
    </div>
  );
}

function ViewportCard({ id }: { id: keyof typeof VIEW_META }) {
  const activeViewport = useApp((s) => s.activeViewport);
  const projection = useApp((s) => s.camera.projection);
  const empty = useApp((s) => s.entities.length === 0);
  const meta = VIEW_META[id];
  const isMain = id === 'perspective';
  const title = isMain && projection === 'orthographic' ? '正交主视口' : meta.title;
  const badge = isMain && projection === 'orthographic' ? 'ORTHO' : meta.badge;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section className={`vp-card ${activeViewport === id ? 'is-active' : ''} ${id}`}>
      <canvas data-viewport={id} className="viewport-canvas" aria-label={`${title} 三维视口`} />
      <header className="vp-header">
        <div className="vp-title-wrap">
          <span className="vp-dot" />
          <div>
            <div className="vp-title">{title}</div>
            <div className="vp-sub">{meta.sub}</div>
          </div>
        </div>
        <div className="vp-head-right">
          <span className="vp-badge">{badge}</span>
          <IconButton title="适合全部" className="vp-tool" onClick={() => getViewportController()?.fitAll()}>
            <Focus size={13} />
          </IconButton>
          <IconButton title="重置四视图" className="vp-tool" onClick={() => getViewportController()?.resetViews()}>
            <RotateCcw size={13} />
          </IconButton>
        </div>
      </header>
      <div className="vp-corner tl" />
      <div className="vp-corner br" />
      <footer className="vp-footer">
        <span>{meta.hint}</span>
      </footer>
      {isMain && empty ? (
        <div className="vp-empty">
          <div className="vp-empty-card">
            <div className="mini-logo">S</div>
            <strong>开始你的立体几何实验</strong>
            <p>从左侧创建图元，或载入示例场景。四个视口共享同一场景，实时同步。</p>
          </div>
        </div>
      ) : null}
      {!ready ? <div className="vp-loading" /> : null}
    </section>
  );
}

export function ViewportGrid() {
  const rootRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ViewportEngine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rootRef.current || engineRef.current) return;
    try {
      const engine = new ViewportEngine(rootRef.current);
      engineRef.current = engine;
      (window as unknown as { __solidgeoEngine?: ViewportEngine }).__solidgeoEngine = engine;
      getViewportController()?.fitAll();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    }
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="stage">
      <StageToolbar />
      {error ? (
        <div className="webgl-error">
          <strong>无法初始化 WebGL</strong>
          <p>{error}</p>
          <p>请确认显卡驱动可用，或启动时添加 --disable-gpu 参数后重试。</p>
        </div>
      ) : (
        <div className="viewport-grid" ref={rootRef}>
          <ViewportCard id="perspective" />
          <ViewportCard id="top" />
          <ViewportCard id="front" />
          <ViewportCard id="left" />
        </div>
      )}
    </main>
  );
}
