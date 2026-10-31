import { useId, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Camera,
  ChevronRight,
  ImagePlus,
  Leaf,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UtensilsCrossed
} from "lucide-react";
import type { AppMeta, DaySummary, Meal, Profile } from "../../shared/types";
import { MEAL_TYPE_LABELS } from "../../shared/nutrition";
import { dateKey, formatClock, friendlyDate, greeting } from "../lib/format";
import { AdviceCard } from "../components/AdviceCard";
import { MacroBar } from "../components/MacroBar";
import { ProgressRing } from "../components/ProgressRing";

const GOAL_LABELS = {
  "fat-loss": "减脂",
  maintain: "维持",
  muscle: "增肌"
} as const;

const DEMO_STATS = { kcal: 377, protein: 31, items: 8 };

export function HomeScreen({
  profile,
  summary,
  meta,
  loading,
  onCamera,
  onGallery,
  onDemo,
  onFile,
  onOpenJournal,
  onRecord
}: {
  profile: Profile | null;
  summary: DaySummary | null;
  meta: AppMeta | null;
  loading: boolean;
  onCamera: () => void;
  onGallery: () => void;
  onDemo: () => void;
  onFile: (file: File) => void;
  onOpenJournal: () => void;
  onRecord: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const orbitId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pathId = `orbit-${orbitId}`;
  const targets = summary?.targets ?? profile?.targets ?? null;
  const totals = summary?.totals ?? null;
  const percent = summary?.caloriePercent ?? 0;
  const remaining = summary?.remaining.kcal ?? targets?.kcal ?? 0;
  const mealCount = summary?.meals.length ?? 0;
  const recent = [...(summary?.meals ?? [])].slice(-3).reverse();
  const goal = profile?.goal ?? "fat-loss";

  return (
    <div className="home-page page-enter">
      <section
        className={`hero${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
      >
        <div className="hero__copy">
          <span className="eyebrow">
            <span className="eyebrow__spark">
              <Sparkles size={13} />
            </span>
            AI 视觉营养分析
          </span>
          <p className="hero__greeting">
            {greeting()}，{profile?.name ?? "食刻用户"}
          </p>
          <h1>
            拍一张，
            <br />
            <span className="hero__accent">
              吃明白
              <svg viewBox="0 0 220 14" aria-hidden="true" preserveAspectRatio="none">
                <path d="M3 10.5C48 4.5 132 3.5 216 8.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
            。
          </h1>
          <p className="hero__lead">
            不用查食物表，也不用猜份量。食刻识别盘中食物，你确认克数，热量、三大营养素和下一步建议就都有了。
          </p>

          <div className="hero__actions">
            <button className="button button--primary button--hero" onClick={onCamera}>
              <Camera size={19} strokeWidth={2} />
              拍照识别
            </button>
            <button className="button button--soft" onClick={onGallery}>
              <ImagePlus size={18} />
              从相册选择
            </button>
          </div>

          <div className="hero__subactions">
            <button className="link-button" onClick={onDemo}>
              先看看示例餐盘
              <ArrowUpRight size={14} />
            </button>
            <span className="hero__privacy">
              <ShieldCheck size={14} />
              照片只用于本次分析
            </span>
          </div>

          <div className="hero__proof">
            <div className="proof-avatars" aria-hidden="true">
              <span>🥗</span>
              <span>🍣</span>
              <span>🍜</span>
              <span>🍳</span>
            </div>
            <p>
              <strong>80+</strong> 种中式食材与菜肴
              <span>·</span>
              克数实时重算
            </p>
          </div>
        </div>

        <div className="hero__visual" aria-label="示例餐盘：香煎豆腐彩虹能量碗">
          <div className="hero-disc" aria-hidden="true" />
          <svg className="hero-orbit-text" viewBox="0 0 360 360" aria-hidden="true">
            <defs>
              <path
                id={pathId}
                d="M180,180 m-158,0 a158,158 0 1,1 316,0 a158,158 0 1,1 -316,0"
              />
            </defs>
            <text>
              <textPath href={`#${pathId}`} startOffset="0%">
                EAT WELL · LIVE SLOW · KNOW YOUR PLATE · EAT WELL · LIVE SLOW ·
              </textPath>
            </text>
          </svg>

          <div className="hero-plate">
            <img src="/images/demo-bowl.jpg" alt="一份含豆腐、鸡蛋、玉米和蔬菜的能量碗" />
            <span className="hero-plate__scan" aria-hidden="true" />
          </div>

          <span className="float-chip float-chip--ai">
            <span className="status-dot" />
            AI 已识别
          </span>
          <span className="float-chip float-chip--kcal">
            <strong>{DEMO_STATS.kcal}</strong>
            <small>kcal</small>
          </span>
          <span className="float-chip float-chip--protein">
            <span className="float-chip__icon">
              <Leaf size={14} />
            </span>
            <span>
              <strong>{DEMO_STATS.protein}g</strong>
              <small>蛋白质</small>
            </span>
          </span>
          <span className="float-chip float-chip--items">
            {DEMO_STATS.items} 种食材
          </span>

          <div className="hero-upload-hint">
            <button onClick={onGallery}>
              <ImagePlus size={16} />
              把照片拖到这里
            </button>
          </div>

          {dragging && (
            <div className="drop-overlay">
              <ImagePlus size={30} />
              <strong>松开，开始分析</strong>
              <span>JPG / PNG / WebP · 最大 8MB</span>
            </div>
          )}
        </div>
      </section>

      <section className="home-dashboard">
        <article className="today-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">TODAY</span>
              <h2>今日概览</h2>
            </div>
            <button className="text-button" onClick={onOpenJournal}>
              查看日记 <ArrowRight size={15} />
            </button>
          </div>

          <div className="today-card__body">
            <div className="today-card__main">
              <span className="summary-label">已摄入</span>
              <div className="today-kcal">
                {loading || !totals ? "—" : Math.round(totals.kcal)}
                <small>kcal</small>
              </div>
              <p className={remaining < 0 ? "is-over" : ""}>
                {loading || !targets ? (
                  "正在读取今天的记录…"
                ) : remaining < 0 ? (
                  <>比目标多 <strong>{Math.abs(Math.round(remaining))}</strong> kcal</>
                ) : (
                  <>目标 {Math.round(targets.kcal)} kcal · 还可以吃 <strong>{Math.round(remaining)}</strong> kcal</>
                )}
              </p>
              <div className="today-meta">
                <span>
                  <CalendarDays size={13} /> {friendlyDate(summary?.date ?? dateKey())}
                </span>
                <span>
                  <UtensilsCrossed size={13} /> {mealCount} 餐记录
                </span>
                <span className="goal-chip">{GOAL_LABELS[goal]}</span>
              </div>
            </div>

            <ProgressRing percent={percent} size={150} stroke={10} label="今日热量完成度">
              <span className="ring-percent">{Math.round(percent)}%</span>
              <span className="ring-caption">今日目标</span>
            </ProgressRing>
          </div>

          <div className="today-macros">
            <MacroBar
              label="蛋白质"
              value={totals?.protein ?? 0}
              target={targets?.protein}
              tone="protein"
            />
            <MacroBar label="碳水" value={totals?.carbs ?? 0} target={targets?.carbs} tone="carbs" />
            <MacroBar label="脂肪" value={totals?.fat ?? 0} target={targets?.fat} tone="fat" />
          </div>

          <div className="today-card__foot">
            <p>
              {mealCount === 0
                ? "今天还没有记录。第一张照片，就是更清楚饮食的开始。"
                : percent < 60
                  ? "节奏还很宽裕，下一餐记得把蛋白质吃够。"
                  : percent < 95
                    ? "接近今天的节奏了，接下来优先蔬菜和蛋白质。"
                    : "今天的目标基本达成，晚些时候清淡一点就好。"}
            </p>
            <button className="button button--dark button--small" onClick={onRecord}>
              <Camera size={15} />
              再记一餐
            </button>
          </div>
        </article>

        <aside className="home-aside">
          <div className="advice-panel">
            <div className="card-heading">
              <div>
                <span className="eyebrow">GENTLE COACH</span>
                <h2>今天的小建议</h2>
              </div>
              <span className="advice-panel__mark" aria-hidden="true">
                <Sparkles size={16} />
              </span>
            </div>
            <div className="advice-panel__list">
              {loading ? (
                <>
                  <div className="skeleton skeleton--advice" />
                  <div className="skeleton skeleton--advice" />
                </>
              ) : (
                (summary?.advice ?? []).slice(0, 2).map((advice, index) => (
                  <AdviceCard key={`${advice.kind}-${index}`} advice={advice} index={index} compact />
                ))
              )}
            </div>
            {!meta?.visionEnabled && (
              <div className="demo-note">
                <ScanLine size={15} />
                <p>
                  当前是演示识别。配置 <code>VISION_API_KEY</code> 后，真实照片会被视觉模型分析。
                </p>
              </div>
            )}
          </div>

          <div className="mini-guide">
            <div className="mini-guide__head">
              <SlidersHorizontal size={17} />
              <span>为什么还要填克数？</span>
            </div>
            <p>
              同一份鸡胸肉，80g 和 160g 的热量差一倍。AI 负责“是什么”，你确认“多少”，结果才真正属于你。
            </p>
          </div>
        </aside>
      </section>

      {recent.length > 0 ? (
        <section className="recent-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">RECENT PLATES</span>
              <h2>最近记录</h2>
            </div>
            <button className="text-button" onClick={onOpenJournal}>
              全部记录 <ArrowRight size={15} />
            </button>
          </div>
          <div className="recent-grid">
            {recent.map((meal) => (
              <RecentCard key={meal.id} meal={meal} onClick={onOpenJournal} />
            ))}
          </div>
        </section>
      ) : (
        <section className="starter-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">HOW IT WORKS</span>
              <h2>三步，吃得更明白</h2>
            </div>
            <span className="section-aside">第一次用？从这里开始</span>
          </div>
          <div className="starter-grid">
            <StarterStep
              index="01"
              icon={<Camera size={19} />}
              title="拍下这一餐"
              body="俯拍整盘，光线充足。AI 会拆解主食、蛋白质与蔬菜。"
            />
            <StarterStep
              index="02"
              icon={<SlidersHorizontal size={19} />}
              title="确认每种克数"
              body="按实际吃下的份量微调，热量和营养值会立刻重算。"
            />
            <StarterStep
              index="03"
              icon={<Sparkles size={19} />}
              title="收下这一餐的建议"
              body="结合你的每日目标，告诉你缺什么、下一口怎么吃。"
            />
          </div>
        </section>
      )}

      <section className="photo-tips">
        <div className="photo-tips__intro">
          <Camera size={18} />
          <div>
            <strong>拍得更准的小技巧</strong>
            <span>识别是估算，清晰的画面能显著提高准确度</span>
          </div>
        </div>
        <div className="photo-tips__list">
          <span>
            <i>01</i> 从正上方拍全整盘
          </span>
          <span>
            <i>02</i> 避开逆光和重阴影
          </span>
          <span>
            <i>03</i> 让餐盘占满画面
          </span>
        </div>
        <button className="text-button" onClick={onCamera}>
          现在试试 <ChevronRight size={14} />
        </button>
      </section>
    </div>
  );
}

function RecentCard({ meal, onClick }: { meal: Meal; onClick: () => void }) {
  return (
    <button className="recent-card" onClick={onClick}>
      <span className="recent-card__image">
        {meal.imageUrl ? (
          <img src={meal.imageUrl} alt={meal.name} loading="lazy" />
        ) : (
          <span className="recent-card__emoji">{meal.items[0]?.emoji ?? "🍽️"}</span>
        )}
        <i>{MEAL_TYPE_LABELS[meal.mealType]}</i>
      </span>
      <span className="recent-card__body">
        <small>{formatClock(meal.eatenAt)}</small>
        <strong>{meal.name}</strong>
        <span>
          {Math.round(meal.totals.kcal)} kcal · 蛋白 {Math.round(meal.totals.protein)}g
        </span>
      </span>
      <ArrowUpRight size={16} className="recent-card__arrow" />
    </button>
  );
}

function StarterStep({
  index,
  icon,
  title,
  body
}: {
  index: string;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="starter-step">
      <span className="starter-step__index">{index}</span>
      <span className="starter-step__icon">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
