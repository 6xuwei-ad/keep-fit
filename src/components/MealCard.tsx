import { Clock3, Trash2 } from "lucide-react";
import type { Meal } from "../../shared/types";
import { MEAL_TYPE_LABELS } from "../../shared/nutrition";
import { formatClock } from "../lib/format";

export function MealCard({
  meal,
  onDelete,
  index = 0
}: {
  meal: Meal;
  onDelete: (meal: Meal) => void;
  index?: number;
}) {
  const itemsLine = meal.items.map((item) => item.name).join(" · ");
  const emojis = meal.items.slice(0, 4).map((item) => item.emoji);

  return (
    <article className="meal-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="meal-card__visual">
        {meal.imageUrl ? (
          <img src={meal.imageUrl} alt={meal.name} loading="lazy" />
        ) : (
          <div className="meal-card__mosaic" aria-hidden="true">
            {emojis.map((emoji, emojiIndex) => (
              <span key={`${emoji}-${emojiIndex}`}>{emoji}</span>
            ))}
          </div>
        )}
        <span className="meal-card__type">{MEAL_TYPE_LABELS[meal.mealType]}</span>
      </div>

      <div className="meal-card__body">
        <div className="meal-card__topline">
          <span>
            <Clock3 size={13} />
            {formatClock(meal.eatenAt)}
          </span>
          <span>{meal.items.length} 种食材</span>
        </div>
        <h3>{meal.name}</h3>
        <p>{itemsLine || "自定义饮食记录"}</p>
        <div className="meal-card__nutrients">
          <span>
            <strong>{Math.round(meal.totals.protein)}</strong>g 蛋白质
          </span>
          <i />
          <span>
            <strong>{Math.round(meal.totals.carbs)}</strong>g 碳水
          </span>
          <i />
          <span>
            <strong>{Math.round(meal.totals.fat)}</strong>g 脂肪
          </span>
        </div>
      </div>

      <div className="meal-card__side">
        <div className="meal-card__kcal">
          <strong>{Math.round(meal.totals.kcal)}</strong>
          <span>kcal</span>
        </div>
        <button
          className="icon-button icon-button--danger"
          onClick={() => onDelete(meal)}
          aria-label={`删除 ${meal.name}`}
        >
          <Trash2 size={16} strokeWidth={1.8} />
        </button>
      </div>

    </article>
  );
}
