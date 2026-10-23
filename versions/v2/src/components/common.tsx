import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import type { SolidType } from '../core/types';

export function IconButton({
  title,
  children,
  onClick,
  active = false,
  disabled = false,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''} ${className}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`switch-row ${disabled ? 'is-disabled' : ''}`}>
      {label ? <span>{label}</span> : null}
      <span className={`switch ${checked ? 'is-on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-track">
          <span className="switch-thumb" />
        </span>
      </span>
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <span className="number-input-wrap">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
        {unit ? <em>{unit}</em> : null}
      </span>
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-field">
      {label ? <span>{label}</span> : null}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function FieldRow({
  label,
  value,
  mono = false,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  accent?: 'cyan' | 'amber' | 'green' | 'rose';
}) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span className={`field-value ${mono ? 'is-mono' : ''} ${accent ? `accent-${accent}` : ''}`}>{value}</span>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-head">
          <div className="modal-title-wrap">
            {icon ? <span className="modal-icon">{icon}</span> : null}
            <div>
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          <IconButton title="关闭" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </section>
    </div>
  );
}

const glyphs: Record<SolidType, React.ReactNode> = {
  cube: (
    <>
      <path d="M9 16.5 28 8l19 8.5-19 8.5-19-8.5Z" />
      <path d="M9 16.5v16L28 41l19-8.5v-16" />
      <path d="M28 25v16" />
    </>
  ),
  cuboid: (
    <>
      <path d="M7 18.5 26 10l22 8.5-19 8.5-22-8.5Z" />
      <path d="M7 18.5v11L26 38l22-8.5v-11" />
      <path d="M26 27v11" />
    </>
  ),
  prism: (
    <>
      <path d="m13 17 8-7 25 3 8 7-8 8-25-3-8-8Z" />
      <path d="M13 17v15l8 8 25 3V20" />
      <path d="M21 40V25" />
    </>
  ),
  pyramid: (
    <>
      <path d="M8 33 28 9l20 24-20 10L8 33Z" />
      <path d="M28 9v34M8 33h40" />
    </>
  ),
  cylinder: (
    <>
      <ellipse cx="28" cy="15" rx="18" ry="7" />
      <path d="M10 15v22c0 4 8 7 18 7s18-3 18-7V15" />
      <path d="M10 37c0 4 8 7 18 7s18-3 18-7" opacity=".4" />
    </>
  ),
  cone: (
    <>
      <path d="M28 8 11 38" />
      <path d="M28 8l17 30" />
      <ellipse cx="28" cy="38" rx="17" ry="6" />
      <path d="M11 38c0 4 8 6 17 6s17-2 17-6" opacity=".35" />
    </>
  ),
  sphere: (
    <>
      <circle cx="28" cy="25" r="18" />
      <ellipse cx="28" cy="25" rx="8" ry="18" />
      <path d="M10 25h36M13 15c5 5 25 5 30 0M13 35c5-5 25-5 30 0" opacity=".55" />
    </>
  ),
  tetra: (
    <>
      <path d="M28 8 10 37l36-4L28 8Z" />
      <path d="M28 8v25M10 37l18-4 18 4M28 33 20 20M28 33l8-13" opacity=".5" />
    </>
  ),
  extrude: (
    <>
      <path d="M8 30 23 22l18 5 7 8-15 8-17-5-8-8Z" />
      <path d="M8 30v8l8 7 17 5 15-8v-7M23 22l8 7" />
    </>
  ),
};

export function SolidGlyph({ type, size = 42 }: { type: SolidType; size?: number }) {
  return (
    <svg
      className="solid-glyph"
      width={size}
      height={size}
      viewBox="0 0 56 52"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      {glyphs[type]}
    </svg>
  );
}

export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function EmptyHint({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="empty-hint">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
