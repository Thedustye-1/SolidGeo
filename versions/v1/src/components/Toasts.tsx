import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { useApp } from '../store/useApp';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast tone-${toast.tone}`} key={toast.id}>
          <span className="toast-icon">
            {toast.tone === 'success' ? <CheckCircle2 size={17} /> : toast.tone === 'error' ? <XCircle size={17} /> : toast.tone === 'warn' ? <TriangleAlert size={17} /> : <Info size={17} />}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="关闭提示">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
