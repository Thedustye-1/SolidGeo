import { useEffect } from 'react';
import { useApp } from './store/useApp';
import { getViewportController } from './render/viewportController';
import { newProject, openProject, saveProject } from './lib/sceneActions';
import { TitleBar } from './components/TitleBar';
import { MenuBar } from './components/MenuBar';
import { LeftPanel } from './components/LeftPanel';
import { ViewportGrid } from './components/ViewportGrid';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import { Dialogs } from './components/Dialogs';
import { Toasts } from './components/Toasts';

export default function App() {
  const theme = useApp((s) => s.settings.theme);
  const docName = useApp((s) => s.docName);
  const dirty = useApp((s) => s.dirty);
  const dialog = useApp((s) => s.dialog);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${docName} · SolidGeo`;
    window.solidgeo?.setDirty(dirty);
  }, [dirty, docName]);

  useEffect(() => {
    if (!window.solidgeo) return;
    return window.solidgeo.onCloseRequested(() => {
      if (!useApp.getState().dirty || window.confirm('当前场景有未保存的修改，确定退出 SolidGeo 吗？')) {
        window.solidgeo?.setDirty(false);
        void window.solidgeo?.forceClose();
      }
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const state = useApp.getState();

      if (mod && key === 's') {
        e.preventDefault();
        void saveProject();
        return;
      }
      if (typing) return;
      if (mod && key === 'o') {
        e.preventDefault();
        void openProject();
        return;
      }
      if (mod && key === 'n') {
        e.preventDefault();
        newProject();
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        state.redo();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        state.deleteSelected();
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (state.selection.length) {
          e.preventDefault();
          state.deleteSelected();
        }
        return;
      }
      if (key === 'escape') {
        if (state.dialog) {
          state.setDialog(null);
        } else if (state.activeTool !== 'select') {
          state.setActiveTool('select');
          state.toast('已退出创建工具', 'info');
        } else if (state.selection.length) {
          state.clearSelection();
        }
        return;
      }
      if (mod || e.altKey) return;
      if (key === 'r') {
        e.preventDefault();
        state.setSettings({ autoRotate: !state.settings.autoRotate });
        state.toast(state.settings.autoRotate ? '自动旋转已停止' : '自动旋转演示已开启', 'info');
        return;
      }
      if (key === 'w') {
        e.preventDefault();
        state.setSettings({ wireframe: !state.settings.wireframe });
        return;
      }
      if (key === 'p') {
        state.setActiveTool('point');
        return;
      }
      if (key === 's') {
        state.setActiveTool('segment');
        return;
      }
      if (key === 'l') {
        state.setActiveTool('line');
        return;
      }
      if (key === 'n') {
        state.setActiveTool('plane');
        return;
      }
      if (key === 'f') {
        e.preventDefault();
        if (e.shiftKey) getViewportController()?.fitSelection();
        else getViewportController()?.fitAll();
        return;
      }
      if (key === '=' || key === '+') {
        e.preventDefault();
        getViewportController()?.fitSelection();
        return;
      }
      if (key === '?') {
        state.setDialog({ kind: 'help', page: 'shortcuts' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keep the "unsaved" marker accurate after file dialog operations.
  useEffect(() => {
    if (dialog?.kind === 'new-confirm' && !dirty) useApp.getState().setDialog(null);
  }, [dialog, dirty]);

  return (
    <div className="app-shell">
      <div className="ambient-layer" aria-hidden>
        <div className="ambient-orb orb-a" />
        <div className="ambient-orb orb-b" />
        <div className="ambient-orb orb-c" />
        <div className="ambient-grid" />
      </div>
      <div className="acrylic-noise" aria-hidden />
      <TitleBar />
      <MenuBar />
      <div className="workspace">
        <LeftPanel />
        <ViewportGrid />
        <Inspector />
      </div>
      <StatusBar />
      <Dialogs />
      <Toasts />
    </div>
  );
}
