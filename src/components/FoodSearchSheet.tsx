import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Plus, Search, X } from "lucide-react";
import type { FoodCatalogItem } from "../../shared/types";
import { CATEGORY_LABELS } from "../../shared/nutrition";
import { searchFoods } from "../lib/api";

export function FoodSearchSheet({
  open,
  onClose,
  onAdd
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (food: FoodCatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<FoodCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(
      () => {
        searchFoods(query)
          .then((result) => {
            if (!ignore) setFoods(result);
          })
          .catch((reason: unknown) => {
            if (!ignore) setError(reason instanceof Error ? reason.message : "食物库加载失败");
          })
          .finally(() => {
            if (!ignore) setLoading(false);
          });
      },
      query ? 180 : 0
    );
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  if (!open) return null;

  return createPortal(
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="food-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-sheet-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="food-sheet__handle" aria-hidden="true" />
        <header className="food-sheet__header">
          <div>
            <span className="eyebrow">FOOD LIBRARY</span>
            <h2 id="food-sheet-title">添加漏掉的食物</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <label className="search-box">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索米饭、鸡胸肉、西兰花…"
            aria-label="搜索食物"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="清空搜索">
              <X size={14} />
            </button>
          )}
        </label>

        <div className="food-sheet__meta">
          <span>{query ? `搜索「${query}」` : "常用食材"}</span>
          <span>营养值按每 100g</span>
        </div>

        <div className="food-results">
          {loading && (
            <div className="food-results__state">
              <LoaderCircle className="spin" size={20} />
              正在查找…
            </div>
          )}
          {!loading && error && (
            <div className="food-results__state food-results__state--error">{error}</div>
          )}
          {!loading && !error && foods.length === 0 && (
            <div className="food-results__state">没有找到，换个关键词试试</div>
          )}
          {!loading &&
            !error &&
            foods.map((food) => (
              <button key={food.id} className="food-result" onClick={() => onAdd(food)}>
                <span className={`food-result__emoji food-result__emoji--${food.category}`}>
                  {food.emoji}
                </span>
                <span className="food-result__info">
                  <strong>{food.name}</strong>
                  <small>
                    {CATEGORY_LABELS[food.category]} · {food.per100g.kcal} kcal / 100g
                  </small>
                </span>
                <span className="food-result__add">
                  <Plus size={17} strokeWidth={2.2} />
                </span>
              </button>
            ))}
        </div>

        <p className="food-sheet__foot">
          每 100g 营养值来自内置食物库，实际烹饪方式会影响结果。
        </p>
      </section>
    </div>,
    document.body
  );
}
