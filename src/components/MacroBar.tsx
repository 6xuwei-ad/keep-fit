interface MacroBarProps {
  label: string;
  value: number;
  target?: number;
  unit?: string;
  tone: "protein" | "carbs" | "fat" | "fiber";
}

export function MacroBar({ label, value, target, unit = "g", tone }: MacroBarProps) {
  const width = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className={`macro-bar macro-bar--${tone}`}>
      <div className="macro-bar__head">
        <span className="macro-bar__label">
          <i aria-hidden="true" />
          {label}
        </span>
        <span className="macro-bar__value">
          {Math.round(value)}
          <small>{unit}</small>
          {target ? <em>/ {Math.round(target)}{unit}</em> : null}
        </span>
      </div>
      <div className="macro-bar__track" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
