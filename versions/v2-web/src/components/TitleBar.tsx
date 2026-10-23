import { useEffect, useState } from 'react';
import {
  Link2,
  Link2Off,
  Minus,
  Moon,
  Square,
  Sun,
  X,
} from 'lucide-react';
import { useApp } from '../store/useApp';
import { IconButton } from './common';

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 40 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id="lg-a" x1="5" y1="6" x2="35" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67e8f9" />
          <stop offset=".5" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="lg-b" x1="10" y1="20" x2="30" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path d="m20 3 14 7.5v16L20 34 6 26.5v-16L20 3Z" stroke="url(#lg-a)" strokeWidth="1.6" fill="rgba(56,189,248,.08)" />
      <path d="m6 10.5 14 8 14-8M20 18.5V34" stroke="url(#lg-b)" strokeWidth="1.4" opacity=".95" />
      <path d="m13 13.5 14 8v12" stroke="rgba(165,243,252,.55)" strokeWidth="1.1" />
      <circle cx="20" cy="18.5" r="1.9" fill="#e0f2fe" />
      <circle cx="6" cy="10.5" r="1.5" fill="#7dd3fc" />
      <circle cx="34" cy="10.5" r="1.5" fill="#a78bfa" />
      <circle cx="20" cy="3" r="1.5" fill="#e0f2fe" />
    </svg>
  );
}

export function TitleBar() {
  const docName = useApp((s) => s.docName);
  const dirty = useApp((s) => s.dirty);
  const theme = useApp((s) => s.settings.theme);
  const linked = useApp((s) => s.settings.linked);
  const setSettings = useApp((s) => s.setSettings);
  const [version, setVersion] = useState('2.0.0');
  const [maximized, setMaximized] = useState(false);
  const electron = Boolean(window.solidgeo?.isElectron);

  useEffect(() => {
    if (!window.solidgeo) return;
    window.solidgeo.getVersion().then(setVersion).catch(() => undefined);
    window.solidgeo.isMaximized().then(setMaximized).catch(() => undefined);
    return window.solidgeo.onMaximizedChanged(setMaximized);
  }, []);

  return (
    <header className={`titlebar ${electron ? 'is-electron' : 'is-browser'}`}>
      <div className="titlebar-brand">
        <LogoMark />
        <div className="brand-copy">
          <span className="brand-name">SolidGeo</span>
          <span className="brand-sub">立体几何实验室</span>
        </div>
      </div>
      <div className="titlebar-doc">
        <span className={`save-dot ${dirty ? 'is-dirty' : ''}`} />
        <span className="doc-name">{docName}</span>
        <span className="doc-state">{dirty ? '未保存' : '已保存'}</span>
      </div>
      <div className="titlebar-spacer" />
      <div className="titlebar-tools">
        <button
          className={`title-chip ${linked ? 'is-on' : ''}`}
          type="button"
          title={linked ? '视图联动已开启' : '视图联动已关闭'}
          onClick={() => setSettings({ linked: !linked })}
        >
          {linked ? <Link2 size={14} /> : <Link2Off size={14} />}
          <span>联动</span>
        </button>
        <button
          className="title-chip"
          type="button"
          title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
        >
          {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          <span>{theme === 'dark' ? '深色' : '浅色'}</span>
        </button>
        <span className="version-pill">v{version}</span>
      </div>
      {electron ? (
        <div className="window-controls">
          <IconButton
            title="最小化"
            className="window-btn"
            onClick={() => window.solidgeo?.minimize()}
          >
            <Minus size={15} />
          </IconButton>
          <IconButton
            title={maximized ? '还原' : '最大化'}
            className="window-btn"
            onClick={async () => {
              if (!window.solidgeo) return;
              setMaximized(await window.solidgeo.toggleMaximize());
            }}
          >
            <Square size={11} />
          </IconButton>
          <IconButton
            title="关闭"
            className="window-btn window-close"
            onClick={() => window.solidgeo?.close()}
          >
            <X size={15} />
          </IconButton>
        </div>
      ) : null}
    </header>
  );
}
