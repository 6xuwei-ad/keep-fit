import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  Database,
  Dumbbell,
  Flame,
  Info,
  Leaf,
  Lock,
  RotateCcw,
  Scale,
  Sparkles,
  Target
} from "lucide-react";
import type { Goal, Profile, Targets } from "../../shared/types";
import { GOAL_TARGETS, round } from "../../shared/nutrition";
import { updateProfile } from "../lib/api";

const GOAL_OPTIONS: Array<{
  id: Goal;
  label: string;
  description: string;
  icon: typeof Flame;
}> = [
  {
    id: "fat-loss",
    label: "减脂",
    description: "温和热量缺口，优先保住肌肉与饱腹感。",
    icon: Flame
  },
  {
    id: "maintain",
    label: "维持",
    description: "找到能量平衡，让体重和精力都稳定下来。",
    icon: Scale
  },
  {
    id: "muscle",
    label: "增肌",
    description: "小幅盈余，给训练和恢复足够的原料。",
    icon: Dumbbell
  }
];

const FIELD_CONFIG: Array<{
  key: keyof Targets;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "kcal", label: "每日热量", unit: "kcal", min: 800, max: 5000, step: 50 },
  { key: "protein", label: "蛋白质", unit: "g", min: 30, max: 300, step: 5 },
  { key: "carbs", label: "碳水", unit: "g", min: 30, max: 600, step: 10 },
  { key: "fat", label: "脂肪", unit: "g", min: 15, max: 200, step: 5 },
  { key: "fiber", label: "膳食纤维", unit: "g", min: 10, max: 80, step: 1 }
];

function validateTargets(targets: Targets): string | null {
  for (const field of FIELD_CONFIG) {
    const value = targets[field.key];
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      return `${field.label}需要在 ${field.min}–${field.max} ${field.unit} 之间`;
    }
  }
  const macroKcal = targets.protein * 4 + targets.carbs * 4 + targets.fat * 9;
  if (macroKcal < targets.kcal * 0.7 || macroKcal > targets.kcal * 1.3) {
    return "三大营养素的热量之和与总热量差距过大，请再检查一下";
  }
  return null;
}

export function GoalsScreen({
  profile,
  onSaved,
  onToast
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
  onToast: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [name, setName] = useState(profile.name);
  const [goal, setGoal] = useState<Goal>(profile.goal);
  const [targets, setTargets] = useState<Targets>(profile.targets);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(profile.name);
    setGoal(profile.goal);
    setTargets(profile.targets);
  }, [profile]);

  const chooseGoal = (next: Goal) => {
    setGoal(next);
    setTargets(GOAL_TARGETS[next]);
    setError(null);
  };

  const changeTarget = (key: keyof Targets, raw: string) => {
    const parsed = Number(raw);
    setTargets((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? round(parsed, 0) : 0
    }));
    setError(null);
  };

  const handleSave = async () => {
    const message = validateTargets(targets);
    if (message) {
      setError(message);
      onToast(message, "error");
      return;
    }
    if (!name.trim()) {
      setError("给自己一个称呼吧");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({ name: name.trim(), goal, targets });
      onSaved(updated);
      onToast("目标已更新，今天的建议也会跟着调整", "success");
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "保存失败，请重试";
      setError(text);
      onToast(text, "error");
    } finally {
      setSaving(false);
    }
  };

  const macroKcal = targets.protein * 4 + targets.carbs * 4 + targets.fat * 9;
  const macroPercent = targets.kcal > 0 ? Math.round((macroKcal / targets.kcal) * 100) : 0;
  const selectedGoal = GOAL_OPTIONS.find((option) => option.id === goal) ?? GOAL_OPTIONS[0]!;

  return (
    <div className="goals-page page-enter">
      <header className="page-heading">
        <div>
          <span className="eyebrow">YOUR BASELINE</span>
          <h1>把目标，调成你的节奏。</h1>
          <p>目标不是束缚，而是一把尺。先设一个能坚持的起点，之后随时可以回来调整。</p>
        </div>
        <div className="goal-page-mark" aria-hidden="true">
          <Target size={30} strokeWidth={1.5} />
        </div>
      </header>

      <div className="goals-grid">
        <section className="goals-main">
          <article className="goal-profile-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">PROFILE</span>
                <h2>怎么称呼你</h2>
              </div>
              <span className="avatar-chip">{name.slice(0, 1) || "食"}</span>
            </div>
            <label className="field-label" htmlFor="profile-name">
              昵称
              <input
                id="profile-name"
                value={name}
                maxLength={20}
                onChange={(event) => setName(event.target.value)}
                placeholder="食刻用户"
              />
            </label>
          </article>

          <article className="goal-choice-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">GOAL</span>
                <h2>你现在更在意什么</h2>
              </div>
              <span className="goal-choice-card__hint">切换会更新推荐目标</span>
            </div>
            <div className="goal-options">
              {GOAL_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    className={`goal-option${goal === option.id ? " is-active" : ""}`}
                    onClick={() => chooseGoal(option.id)}
                    aria-pressed={goal === option.id}
                  >
                    <span className="goal-option__icon">
                      <Icon size={20} strokeWidth={1.8} />
                    </span>
                    <span className="goal-option__copy">
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                      <small>{GOAL_TARGETS[option.id].kcal} kcal / 天</small>
                    </span>
                    <span className="goal-option__check">
                      {goal === option.id && <Check size={14} strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="targets-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">DAILY TARGETS</span>
                <h2>每日目标</h2>
              </div>
              <span className="macro-balance">
                宏量供能 {macroPercent}% <Info size={13} />
              </span>
            </div>
            <p className="targets-intro">
              按 <strong>{selectedGoal.label}</strong> 预设填入，也可以直接改成你习惯的数字。
            </p>
            <div className="targets-grid">
              {FIELD_CONFIG.map((field) => (
                <label key={field.key} className="target-field">
                  <span>{field.label}</span>
                  <div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={targets[field.key]}
                      onChange={(event) => changeTarget(field.key, event.target.value)}
                    />
                    <small>{field.unit}</small>
                  </div>
                </label>
              ))}
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="targets-actions">
              <button
                className="button button--ghost button--small"
                onClick={() => {
                  setTargets(GOAL_TARGETS[goal]);
                  setError(null);
                }}
              >
                <RotateCcw size={14} />
                恢复推荐值
              </button>
              <button className="button button--primary" onClick={handleSave} disabled={saving}>
                {saving ? <RotateCcw className="spin" size={16} /> : <Check size={16} />}
                {saving ? "保存中…" : "保存目标"}
              </button>
            </div>
          </article>
        </section>

        <aside className="goals-aside">
          <div className="goal-summary-card">
            <span className="eyebrow eyebrow--light">YOUR DAILY BUDGET</span>
            <div className="goal-summary-card__kcal">
              {Math.round(targets.kcal)}
              <small>kcal</small>
            </div>
            <p>{selectedGoal.description}</p>
            <div className="goal-summary-card__line">
              <span>蛋白质</span>
              <strong>{targets.protein}g</strong>
            </div>
            <div className="goal-summary-card__line">
              <span>碳水</span>
              <strong>{targets.carbs}g</strong>
            </div>
            <div className="goal-summary-card__line">
              <span>脂肪</span>
              <strong>{targets.fat}g</strong>
            </div>
            <div className="goal-summary-card__line">
              <span>膳食纤维</span>
              <strong>{targets.fiber}g</strong>
            </div>
            <div className="goal-summary-card__foot">
              <Sparkles size={14} />
              每餐建议约占全天的 30–35%
            </div>
          </div>

          <div className="method-card">
            <div className="method-card__head">
              <Activity size={17} />
              <span>这些数字怎么用</span>
            </div>
            <ul>
              <li>先按目标吃两周，再看体重、围度与精力变化。</li>
              <li>体重每周下降 0.3–0.8% 通常更容易坚持。</li>
              <li>蛋白质优先分配到三餐，每餐 25–35g。</li>
              <li>不必每天精确到个位数，看一周平均更有意义。</li>
            </ul>
          </div>

          <div className="privacy-card">
            <div>
              <Lock size={16} />
              <strong>你的记录，只属于你</strong>
            </div>
            <p>记录保存在食刻服务端的独立设备空间中，不用于训练或广告。</p>
          </div>

          <div className="data-card">
            <div>
              <Database size={16} />
              <strong>关于估算</strong>
            </div>
            <p>
              食物营养值来自公开食物成分数据的近似值；AI 识别与份量估算存在误差，适合趋势管理，不替代医疗建议。
            </p>
            <span className="data-card__version">SHIKE v1.0 · {profile.deviceId.slice(0, 8)}</span>
          </div>
        </aside>
      </div>

      <div className="goals-footnote">
        <Leaf size={15} />
        <span>好的饮食不是每天完美，而是大多数时候，都知道自己在吃什么。</span>
        <button className="text-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          回到顶部 <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
