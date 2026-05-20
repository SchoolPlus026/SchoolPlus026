import { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

let toastId = 0;

const ICONS = {
  success: <CheckCircle size={18} />,
  error:   <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info:    <Info size={18} />,
};

const COLORS = {
  success: { bg: 'var(--card-bg)', border: '#22c55e', icon: '#22c55e', text: 'var(--text-main)' },
  error:   { bg: 'var(--card-bg)', border: '#ef4444', icon: '#ef4444', text: 'var(--text-main)' },
  warning: { bg: 'var(--card-bg)', border: '#f59e0b', icon: '#f59e0b', text: 'var(--text-main)' },
  info:    { bg: 'var(--card-bg)', border: '#6366f1', icon: '#6366f1', text: 'var(--text-main)' },
};

function ToastItem({ toast, onRemove }) {
  const colors = COLORS[toast.type] || COLORS.info;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 22 } }}
      exit={{ opacity: 0, x: 80, scale: 0.9, transition: { duration: 0.2, ease: 'easeIn' } }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: '14px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px ${colors.border}22`,
        minWidth: '280px',
        maxWidth: '360px',
        backdropFilter: 'blur(12px)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={() => onRemove(toast.id)}
    >
      <span style={{ color: colors.icon, flexShrink: 0, marginTop: '1px' }}>
        {ICONS[toast.type]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: colors.text, lineHeight: 1.3 }}>
            {toast.title}
          </p>
        )}
        {toast.message && (
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', marginTop: toast.title ? '3px' : 0, lineHeight: 1.4 }}>
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(toast.id); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '0', flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, title, message }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="sync">
          {toasts.map(toast => (
            <div key={toast.id} style={{ pointerEvents: 'auto' }}>
              <ToastItem toast={toast} onRemove={removeToast} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
