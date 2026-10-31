import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";

export function GramControl({
  value,
  onChange,
  min = 1,
  max = 3000,
  step = 10
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <div className="gram-control">
      <button
        type="button"
        onClick={() => commit(value - step)}
        aria-label={`减少 ${step} 克`}
        disabled={value <= min}
      >
        <Minus size={14} strokeWidth={2.4} />
      </button>
      <label className="gram-control__input" htmlFor={inputId}>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          aria-label="食物克数"
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            const parsed = Number(raw);
            if (raw !== "" && Number.isFinite(parsed) && parsed >= min) {
              onChange(Math.min(max, Math.round(parsed)));
            }
          }}
          onBlur={() => {
            const parsed = Number(draft);
            if (!Number.isFinite(parsed) || parsed < min) commit(value);
            else commit(parsed);
          }}
        />
        <span>g</span>
      </label>
      <button
        type="button"
        onClick={() => commit(value + step)}
        aria-label={`增加 ${step} 克`}
        disabled={value >= max}
      >
        <Plus size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}
