import { useId, type ReactNode } from "react";

interface ProgressRingProps {
  percent: number;
  size?: number;
  stroke?: number;
  tone?: "lime" | "coral" | "green";
  children?: ReactNode;
  label?: string;
}

export function ProgressRing({
  percent,
  size = 168,
  stroke = 11,
  tone = "lime",
  children,
  label = "完成度"
}: ProgressRingProps) {
  const rawId = useId();
  const gradientId = `ring-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const capped = Math.max(0, Math.min(percent, 100));
  const offset = circumference - (capped / 100) * circumference;
  const over = percent > 100;

  const colors =
    tone === "coral"
      ? ["#F6A58F", "#EC6748"]
      : tone === "green"
        ? ["#7FB79C", "#2D6A50"]
        : ["#EEF9B8", "#D8EF76"];

  return (
    <div
      className="progress-ring"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={over ? "#F6A58F" : colors[0]} />
            <stop offset="100%" stopColor={over ? "#EC6748" : colors[1]} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(20, 49, 37, 0.09)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="progress-ring__value"
        />
      </svg>
      <div className="progress-ring__center">{children}</div>
    </div>
  );
}
