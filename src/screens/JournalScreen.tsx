import {
  ArrowRight,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  RotateCcw,
  Target
} from "lucide-react";
import type { DaySummary, Profile } from "../../shared/types";
import { MEAL_TYPE_LABELS } from "../../shared/nutrition";
import { dateKey, formatDate, friendlyDate, shiftDateKey } from "../lib/format";
import { AdviceCard } from "../components/AdviceCard";
import { EmptyState } from "../components/EmptyState";
import { MacroBar } from "../components/MacroBar";
import { MealCard } from "../components/MealCard";
import { ProgressRing } from "../components/ProgressRing";

const GOAL_LABELS = {
  "fat-loss": "减脂",
  maintain: "维持",
  muscle: "增肌"
} as const;

export function JournalScreen({
  date,
  summary,
  profile,
  loading,
  onDateChange,
  onRecord,
  onDelete
}: {
  date: string;
  summary: DaySummary | null;
  profile: Profile | null;
  loading: boolean;
  onDateChange: (date: string) => void;
  onRecord: () => void;
  onDelete: (mealId: string) => void;
}) {
  const today = dateKey();
  const isToday = date === today;
  const totals = summary?.totals;
  const targets = summary?.targets ?? profile?.targets;
  const percent = summary?.caloriePercent ?? 0;
  const remaining = summary?.remaining.kcal ?? targets?.kcal ?? 0;
  const meals = summary?.meals ?? [];

  return (
    <div className="journal-page page-enter">
      <header className="page-heading">
        <div>
          <span className="eyebrow">YOUR FOOD DIARY</span>
          <h1>每一餐，都有迹可循。</h1>
          <p>回看吃过的食物与份量，找到真正适合自己的节奏。</p>
        </div>
        <button className="button button--primary" onClick={onRecord}>
          <Camera size={17} />
          记录一餐
        </button>
      </header>

      <div className="date-toolbar">
        <div className="date-control">
          <button className="icon-button" onClick={() => onDateChange(shiftDateKey(date, -1))} aria-label="前一天">
            <ChevronLeft size={18} />
          </button>
          <div className="date-control__label">
            <span>{friendlyDate(date, today)}</span>
            <strong>{formatDate(date)}</strong>
          </div>
          <button
            className="icon-button"
            onClick={() => onDateChange(shiftDateKey(date, 1))}
            aria-label="后一天"
            disabled={date >= today}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {!isToday && (
          <button className="button button--ghost button--small" onClick={() => onDateChange(today)}>
            <RotateCcw size={14} />
            回到今天
          </button>
        )}
        <span className="date-toolbar__hint">
          <CalendarDays size={14} />
          每日记录会自动保存
        </span>
      </div>

      <section className="journal-summary">
        <div className="journal-summary__calories">
          <div>
            <span className="summary-label">已摄入</span>
            <div className="journal-kcal">
              {loading || !totals ? "—" : Math.round(totals.kcal)}
              <small>kcal</small>
            </div>
            <p>
              {targets ? (
                <>
                  目标 {Math.round(targets.kcal)} kcal
                  <span>·</span>
                  {remaining >= 0 ? (
                    <>剩余 <strong>{Math.round(remaining)}</strong> kcal</>
                  ) : (
                    <>超出 <strong>{Math.abs(Math.round(remaining))}</strong> kcal</>
                  )}
                </>
              ) : (
                "正在读取目标…"
              )}
            </p>
          </div>
          <ProgressRing percent={percent} size={162} stroke={11} label="今日热量完成度">
            <span className="ring-percent">{Math.round(percent)}%</span>
            <span className="ring-caption">目标完成</span>
          </ProgressRing>
        </div>

        <div className="journal-summary__macros">
          <MacroBar label="蛋白质" value={totals?.protein ?? 0} target={targets?.protein} tone="protein" />
          <MacroBar label="碳水" value={totals?.carbs ?? 0} target={targets?.carbs} tone="carbs" />
          <MacroBar label="脂肪" value={totals?.fat ?? 0} target={targets?.fat} tone="fat" />
          <MacroBar label="膳食纤维" value={totals?.fiber ?? 0} target={targets?.fiber} tone="fiber" />
        </div>

        <div className="journal-summary__stats">
          <div>
            <span>餐次</span>
            <strong>{meals.length}</strong>
            <small>餐</small>
          </div>
          <div>
            <span>食材</span>
            <strong>{meals.reduce((sum, meal) => sum + meal.items.length, 0)}</strong>
            <small>种</small>
          </div>
          <div>
            <span>目标</span>
            <strong>{profile ? GOAL_LABELS[profile.goal] : "—"}</strong>
            <small>模式</small>
          </div>
        </div>
      </section>

      <div className="journal-grid">
        <section className="journal-meals">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MEALS</span>
              <h2>{isToday ? "今天吃了什么" : friendlyDate(date, today) + "吃了什么"}</h2>
            </div>
            <span className="count-pill">{meals.length} 餐</span>
          </div>

          {loading ? (
            <div className="meal-list">
              <div className="skeleton skeleton--meal" />
              <div className="skeleton skeleton--meal" />
            </div>
          ) : meals.length === 0 ? (
            <div className="journal-empty">
              <EmptyState
                title={isToday ? "今天还没有记录" : "这一天还没有记录"}
                body={
                  isToday
                    ? "拍下下一餐，让今天的热量和营养有据可循。"
                    : "可以切换到今天记录一餐，或继续回看其他日期。"
                }
                actionLabel={isToday ? "记录第一餐" : "回到今天"}
                onAction={isToday ? onRecord : () => onDateChange(today)}
                icon={<Camera size={26} strokeWidth={1.7} />}
              />
              {meals.length === 0 && (
                <div className="journal-empty__strip">
                  {(["breakfast", "lunch", "dinner", "snack"] as const).map((type) => (
                    <span key={type}>
                      {MEAL_TYPE_LABELS[type]}
                      <i>待记录</i>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="meal-list">
              {meals.map((meal, index) => (
                <MealCard key={meal.id} meal={meal} index={index} onDelete={() => onDelete(meal.id)} />
              ))}
            </div>
          )}

          {meals.length > 0 && (
            <button className="add-meal-row" onClick={onRecord}>
              <span>
                <Camera size={16} />
                再记一餐
              </span>
              <ArrowRight size={16} />
            </button>
          )}
        </section>

        <aside className="journal-aside">
          <div className="advice-panel advice-panel--paper">
            <div className="card-heading">
              <div>
                <span className="eyebrow">DAILY NOTES</span>
                <h2>今天的建议</h2>
              </div>
              <span className="advice-panel__mark" aria-hidden="true">
                <Flame size={16} />
              </span>
            </div>
            <div className="advice-panel__list">
              {(summary?.advice ?? []).slice(0, 3).map((advice, index) => (
                <AdviceCard key={`${advice.kind}-${index}`} advice={advice} index={index} compact />
              ))}
            </div>
          </div>

          <div className="goal-mini-card">
            <div className="goal-mini-card__head">
              <Target size={17} />
              <span>每日目标</span>
              <strong>{targets ? Math.round(targets.kcal) : "—"} kcal</strong>
            </div>
            <div className="goal-mini-card__rows">
              <span>
                蛋白质 <strong>{targets?.protein ?? "—"}g</strong>
              </span>
              <span>
                碳水 <strong>{targets?.carbs ?? "—"}g</strong>
              </span>
              <span>
                脂肪 <strong>{targets?.fat ?? "—"}g</strong>
              </span>
              <span>
                纤维 <strong>{targets?.fiber ?? "—"}g</strong>
              </span>
            </div>
          </div>

          <p className="journal-disclaimer">
            <Info size={13} />
            热量为估算值，适合观察趋势，不代替医学或营养处方。
          </p>
        </aside>
      </div>
    </div>
  );
}
