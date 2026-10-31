import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Info,
  Plus,
  RotateCcw,
  ScanLine,
  Sparkles,
  Trash2,
  WandSparkles
} from "lucide-react";
import type {
  AnalysisResult,
  FoodCatalogItem,
  FoodItem,
  Meal,
  MealType,
  Profile,
  Targets
} from "../../shared/types";
import { buildMealAdvice, buildPlateQuality } from "../../shared/advice";
import {
  MEAL_TYPE_LABELS,
  clamp,
  macroEnergy,
  round,
  scaleNutrition,
  sumNutrition
} from "../../shared/nutrition";
import { saveMeal } from "../lib/api";
import { dateKey } from "../lib/format";
import { AdviceCard } from "../components/AdviceCard";
import { FoodSearchSheet } from "../components/FoodSearchSheet";
import { GramControl } from "../components/GramControl";
import { ProgressRing } from "../components/ProgressRing";
import { MacroBar } from "../components/MacroBar";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function resize(item: FoodItem, grams: number): FoodItem {
  const next = Math.round(clamp(grams, 1, 3000));
  return { ...item, grams: next, nutrition: scaleNutrition(item.per100g, next) };
}

export function ReviewScreen({
  analysis,
  profile,
  suggestedMealType,
  onBack,
  onSaved,
  onToast
}: {
  analysis: AnalysisResult;
  profile: Profile;
  suggestedMealType: MealType;
  onBack: () => void;
  onSaved: (meal: Meal) => void;
  onToast: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [items, setItems] = useState<FoodItem[]>(analysis.items);
  const [mealType, setMealType] = useState<MealType>(suggestedMealType);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const targets: Targets = profile.targets;
  const totals = useMemo(() => sumNutrition(items), [items]);
  const quality = useMemo(() => buildPlateQuality(items, totals, targets), [items, totals, targets]);
  const advice = useMemo(() => buildMealAdvice(items, totals, targets), [items, totals, targets]);
  const energy = macroEnergy(totals);
  const avgConfidence = items.length
    ? Math.round((items.reduce((sum, item) => sum + item.confidence, 0) / items.length) * 100)
    : 0;
  const dailyPercent = targets.kcal > 0 ? Math.round((totals.kcal / targets.kcal) * 100) : 0;

  const updateGrams = (id: string, grams: number) => {
    setItems((current) => current.map((item) => (item.id === id ? resize(item, grams) : item)));
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const addFood = (food: FoodCatalogItem) => {
    const existing = items.find((item) => item.foodId === food.id);
    if (existing) {
      updateGrams(existing.id, existing.grams + (food.portions[0]?.grams ?? 100));
      onToast(`已增加 ${food.name} 的份量`, "success");
      setAddOpen(false);
      return;
    }

    const grams = food.portions[0]?.grams ?? 100;
    const next: FoodItem = {
      id: crypto.randomUUID(),
      foodId: food.id,
      name: food.name,
      emoji: food.emoji,
      category: food.category,
      grams,
      confidence: 1,
      portionHint: food.portions[0]
        ? `${food.portions[0].label} · ${food.portions[0].grams}g`
        : "手动添加",
      per100g: food.per100g,
      nutrition: scaleNutrition(food.per100g, grams),
      source: "database"
    };
    setItems((current) => [...current, next]);
    onToast(`已添加 ${food.name}`, "success");
    setAddOpen(false);
  };

  const handleSave = async () => {
    if (items.length === 0) {
      onToast("至少保留一种食物再保存", "error");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const meal = await saveMeal({
        name: analysis.dishName,
        mealType,
        date: dateKey(),
        eatenAt: new Date().toISOString(),
        imageUrl: analysis.imageUrl,
        engine: analysis.engine,
        items: items.map((item) => ({
          foodId: item.foodId,
          name: item.name,
          emoji: item.emoji,
          category: item.category,
          grams: item.grams,
          confidence: item.confidence,
          portionHint: item.portionHint,
          per100g: item.per100g
        }))
      });
      onSaved(meal);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败，请重试";
      setSaveError(message);
      onToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="review-page">
      <div className="review-topbar">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回
        </button>
        <div className="flow-steps" aria-label="识别流程">
          <span className="is-done">
            <Check size={11} /> 拍照
          </span>
          <i />
          <span className="is-active">02 校核份量</span>
          <i />
          <span>03 收下建议</span>
        </div>
        <span className="engine-label">
          <Sparkles size={13} />
          {analysis.engine}
        </span>
      </div>

      <header className="review-heading">
        <div>
          <span className="eyebrow">ANALYSIS / 02</span>
          <h1>确认份量，剩下的交给食刻。</h1>
          <p>
            识别到 <strong>{analysis.items.length}</strong> 种食材。把克数调成实际吃下的量，热量会实时重算。
          </p>
        </div>
        <div className="confidence-stamp">
          <ScanLine size={16} />
          <span>
            平均置信度
            <strong>{avgConfidence}%</strong>
          </span>
        </div>
      </header>

      {analysis.notice && (
        <div className={`notice-banner${analysis.provider === "demo" ? " notice-banner--demo" : ""}`}>
          <Info size={17} />
          <p>{analysis.notice}</p>
        </div>
      )}

      <section className="review-hero">
        <figure className="review-photo">
          <img src={analysis.imageUrl} alt={analysis.dishName} />
          <div className="review-photo__shade" />
          <span className="photo-badge">
            <span className="status-dot" />
            {analysis.provider === "demo" ? "演示识别" : "视觉识别完成"}
          </span>
          <figcaption>
            <span>{analysis.items.length} 种食材 · {avgConfidence}% 置信度</span>
            <h2>{analysis.dishName}</h2>
          </figcaption>
        </figure>

        <aside className="review-summary">
          <div className="review-summary__top">
            <div>
              <span className="summary-label">这一餐约</span>
              <div className="summary-kcal">
                {Math.round(totals.kcal)}
                <small>kcal</small>
              </div>
              <span className="summary-sub">占今日目标 {dailyPercent}%</span>
            </div>
            <ProgressRing percent={quality.score} size={94} stroke={7} tone="green" label="餐盘均衡度">
              <strong className="mini-score">{quality.score}</strong>
              <span className="mini-score-label">均衡度</span>
            </ProgressRing>
          </div>

          <div className="quality-line">
            <span>{quality.label}</span>
            <p>{quality.summary}</p>
          </div>

          <div className="review-macros">
            <MacroBar label="蛋白质" value={totals.protein} target={targets.protein * 0.35} tone="protein" />
            <MacroBar label="碳水" value={totals.carbs} target={targets.carbs * 0.35} tone="carbs" />
            <MacroBar label="脂肪" value={totals.fat} target={targets.fat * 0.35} tone="fat" />
          </div>

          <div className="energy-split" aria-label="三大营养素供能比例">
            <span>蛋白 {energy.protein}%</span>
            <span>碳水 {energy.carbs}%</span>
            <span>脂肪 {energy.fat}%</span>
          </div>

          <div className="meal-type-block">
            <span className="summary-label">这是哪一餐？</span>
            <div className="segmented">
              {MEAL_TYPES.map((type) => (
                <button
                  key={type}
                  className={mealType === type ? "is-active" : ""}
                  onClick={() => setMealType(type)}
                >
                  {MEAL_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <button className="button button--primary button--full" onClick={handleSave} disabled={saving}>
            {saving ? <RotateCcw className="spin" size={17} /> : <Check size={17} strokeWidth={2.4} />}
            {saving ? "正在保存…" : "保存到今日饮食"}
          </button>
          {saveError && <p className="form-error">{saveError}</p>}
        </aside>
      </section>

      <section className="review-items">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PORTIONS</span>
            <h2>识别到的食物</h2>
          </div>
          <div className="section-heading__actions">
            <span className="count-pill">{items.length} 种</span>
            <button className="button button--ghost button--small" onClick={() => setAddOpen(true)}>
              <Plus size={15} />
              添加食物
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="review-empty">
            <p>食材都被移除了。添加一种食物，或返回重新识别。</p>
            <button className="button button--ghost button--small" onClick={() => setAddOpen(true)}>
              <Plus size={15} /> 添加食物
            </button>
          </div>
        ) : (
          <div className="food-list">
            {items.map((item, index) => {
              const lower = Math.max(1, Math.round(item.grams * 0.8));
              const higher = Math.round(item.grams * 1.2);
              return (
                <article className="food-row" key={item.id} style={{ animationDelay: `${index * 45}ms` }}>
                  <div className="food-row__main">
                    <span className={`food-avatar food-avatar--${item.category}`}>{item.emoji}</span>
                    <div className="food-row__identity">
                      <div className="food-row__name">
                        <h3>{item.name}</h3>
                        {item.source === "ai" && <span className="estimate-pill">模型估值</span>}
                      </div>
                      <p>
                        {item.portionHint}
                        <span className="dot-sep">·</span>
                        置信度 {Math.round(item.confidence * 100)}%
                      </p>
                      <div className="confidence-track" aria-hidden="true">
                        <span style={{ width: `${item.confidence * 100}%` }} />
                      </div>
                    </div>
                    <div className="food-row__number">
                      <strong>{Math.round(item.nutrition.kcal)}</strong>
                      <span>kcal</span>
                    </div>
                    <GramControl value={item.grams} onChange={(grams) => updateGrams(item.id, grams)} />
                    <button
                      className="icon-button icon-button--danger food-row__remove"
                      onClick={() => removeItem(item.id)}
                      aria-label={`移除 ${item.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="food-row__foot">
                    <div className="food-row__macros">
                      <span>蛋白 {round(item.nutrition.protein)}g</span>
                      <span>碳水 {round(item.nutrition.carbs)}g</span>
                      <span>脂肪 {round(item.nutrition.fat)}g</span>
                      <span>纤维 {round(item.nutrition.fiber)}g</span>
                    </div>
                    <div className="portion-presets" aria-label="快捷份量">
                      <button onClick={() => updateGrams(item.id, lower)}>少一点 · {lower}g</button>
                      <button className="is-current" onClick={() => updateGrams(item.id, item.grams)}>
                        标准 · {item.grams}g
                      </button>
                      <button onClick={() => updateGrams(item.id, higher)}>多一点 · {higher}g</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="review-advice">
        <div className="section-heading">
          <div>
            <span className="eyebrow">COACH NOTES</span>
            <h2>这一餐，怎么吃得更好</h2>
          </div>
          <span className="advice-badge">
            <WandSparkles size={14} />
            根据你的目标生成
          </span>
        </div>
        <div className="advice-grid">
          {advice.map((tip, index) => (
            <AdviceCard key={`${tip.kind}-${index}`} advice={tip} index={index} />
          ))}
        </div>
        <p className="review-disclaimer">
          <Info size={13} />
          热量与营养值均为估算，AI 识别可能遗漏酱汁、烹调油或少量食材；如有特殊饮食需求，请以专业建议为准。
        </p>
      </section>

      <div className="review-savebar">
        <div>
          <span>这一餐</span>
          <strong>{Math.round(totals.kcal)} kcal</strong>
          <small>蛋白 {round(totals.protein)}g · 碳水 {round(totals.carbs)}g · 脂肪 {round(totals.fat)}g</small>
        </div>
        <button className="button button--primary" onClick={handleSave} disabled={saving}>
          {saving ? <RotateCcw className="spin" size={16} /> : <Check size={16} />}
          {saving ? "保存中…" : "保存记录"}
        </button>
      </div>

      <FoodSearchSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={addFood} />

      <div className="review-next-hint">
        <span>保存后可在「日记」里回看每一天</span>
        <ChevronRight size={14} />
      </div>
    </div>
  );
}
