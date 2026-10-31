import {
  AlertTriangle,
  Check,
  Droplets,
  Drumstick,
  Leaf,
  Scale,
  Sparkles,
  Utensils,
  type LucideIcon
} from "lucide-react";
import type { Advice, AdviceKind } from "../../shared/types";

const ICONS: Record<AdviceKind, LucideIcon> = {
  protein: Drumstick,
  fiber: Leaf,
  portion: Scale,
  fat: Droplets,
  balance: Sparkles,
  water: Droplets,
  timing: Utensils
};

export function AdviceCard({
  advice,
  index = 0,
  compact = false
}: {
  advice: Advice;
  index?: number;
  compact?: boolean;
}) {
  const Icon = ICONS[advice.kind] ?? AlertTriangle;
  return (
    <article
      className={`advice-card advice-card--${advice.kind}${compact ? " advice-card--compact" : ""}`}
      style={{ animationDelay: `${90 + index * 70}ms` }}
    >
      <span className="advice-card__icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <div>
        <h3>{advice.title}</h3>
        <p>{advice.body}</p>
      </div>
      {advice.kind === "balance" && (
        <span className="advice-card__check" aria-hidden="true">
          <Check size={13} strokeWidth={2.5} />
        </span>
      )}
    </article>
  );
}
