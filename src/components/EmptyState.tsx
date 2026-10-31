import type { ReactNode } from "react";
import { ArrowRight, UtensilsCrossed } from "lucide-react";

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  icon
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        {icon ?? <UtensilsCrossed size={26} strokeWidth={1.7} />}
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {actionLabel && onAction && (
        <button className="text-button" onClick={onAction}>
          {actionLabel}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
