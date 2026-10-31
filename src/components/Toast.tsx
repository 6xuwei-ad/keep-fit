import { CheckCircle2, Info, X, AlertCircle } from "lucide-react";
import type { ToastState } from "../types";

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  if (!toast) return null;
  const Icon =
    toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? AlertCircle : Info;

  return (
    <div className={`toast toast--${toast.tone}`} role="status" aria-live="polite">
      <Icon size={18} strokeWidth={2} />
      <span>{toast.message}</span>
      <button onClick={onDismiss} aria-label="关闭提示">
        <X size={15} />
      </button>
    </div>
  );
}
