"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastStatus = "pending" | "confirming" | "success" | "error";

export interface Toast {
  id: string;
  action: string;
  status: ToastStatus;
  hash?: `0x${string}`;
  error?: string;
}

interface ToastDispatch {
  push: (toast: Omit<Toast, "id">) => string;
  update: (id: string, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastDispatch | null>(null);

export function TxToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const push = useCallback((toast: Omit<Toast, "id">): string => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<Toast, "id">>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useTxToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useTxToast must be inside TxToastProvider");
  return ctx;
}

const STATUS_CONFIG: Record<
  ToastStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  pending: {
    label: "Enviando…",
    color: "#F59E0B",
    bg: "rgba(217,119,6,0.12)",
    border: "rgba(217,119,6,0.35)",
  },
  confirming: {
    label: "Confirmando…",
    color: "#F59E0B",
    bg: "rgba(217,119,6,0.12)",
    border: "rgba(217,119,6,0.35)",
  },
  success: {
    label: "Confirmado ✓",
    color: "#34D399",
    bg: "rgba(5,150,105,0.12)",
    border: "rgba(5,150,105,0.35)",
  },
  error: {
    label: "Error",
    color: "#FCA5A5",
    bg: "rgba(220,38,38,0.12)",
    border: "rgba(220,38,38,0.35)",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[toast.status];

  // Auto-dismiss success/error after 6s
  useEffect(() => {
    if (toast.status === "success" || toast.status === "error") {
      const t = setTimeout(() => onDismiss(toast.id), 6000);
      return () => clearTimeout(t);
    }
  }, [toast.status, toast.id, onDismiss]);

  const shortHash = toast.hash
    ? `${toast.hash.slice(0, 6)}…${toast.hash.slice(-4)}`
    : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 7,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 280,
        maxWidth: 340,
        boxShadow: "0 4px 20px rgba(28,20,16,0.35)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: cfg.color,
          }}
        >
          {cfg.label}
        </span>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Cerrar notificación"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(237,217,163,0.4)",
            fontSize: "1rem",
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      <span
        style={{
          fontSize: "0.88rem",
          fontWeight: 600,
          color: "#FAF3E0",
        }}
      >
        {toast.action}
      </span>
      {shortHash && (
        <span
          style={{
            fontSize: "0.70rem",
            fontFamily: "monospace",
            color: "rgba(237,217,163,0.45)",
          }}
        >
          tx: {shortHash}
        </span>
      )}
      {toast.error && (
        <span
          style={{
            fontSize: "0.75rem",
            color: "#FCA5A5",
            wordBreak: "break-word",
          }}
        >
          {toast.error.length > 120 ? toast.error.slice(0, 117) + "…" : toast.error}
        </span>
      )}
    </div>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-label="Notificaciones de transacción"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignItems: "flex-end",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
