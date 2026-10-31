import { useEffect, useState } from "react";
import { LoaderCircle, ScanLine, Sparkles } from "lucide-react";

const STEPS = [
  "正在读取餐盘…",
  "分辨食材与份量…",
  "匹配营养数据库…",
  "整理这一餐的建议…"
];

export function AnalyzeOverlay({ imageUrl }: { imageUrl: string | null }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, 1600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="analyze-overlay" role="dialog" aria-modal="true" aria-label="正在识别食物">
      <div className="analyze-overlay__backdrop" />
      <div className="analyze-panel">
        <div className="analyze-panel__visual">
          {imageUrl ? (
            <img src={imageUrl} alt="正在识别的餐食" />
          ) : (
            <div className="analyze-panel__placeholder">
              <Sparkles size={32} />
            </div>
          )}
          <div className="analyze-panel__grid" aria-hidden="true" />
          <div className="analyze-panel__scan" aria-hidden="true" />
          <span className="analyze-panel__corner analyze-panel__corner--tl" />
          <span className="analyze-panel__corner analyze-panel__corner--tr" />
          <span className="analyze-panel__corner analyze-panel__corner--bl" />
          <span className="analyze-panel__corner analyze-panel__corner--br" />
        </div>

        <div className="analyze-panel__copy">
          <span className="eyebrow eyebrow--light">
            <ScanLine size={14} />
            AI VISION
          </span>
          <h2>正在看懂这一餐</h2>
          <p>{STEPS[step]}</p>
          <div className="analyze-panel__progress" aria-hidden="true">
            <span style={{ width: `${28 + step * 19}%` }} />
          </div>
          <div className="analyze-panel__foot">
            <LoaderCircle className="spin" size={14} />
            通常需要 3–8 秒
          </div>
        </div>
      </div>
    </div>
  );
}
