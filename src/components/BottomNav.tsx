import { Camera, House, NotebookText, Target } from "lucide-react";
import type { Tab } from "../types";

const NAV = [
  { id: "home" as const, label: "今日", icon: House },
  { id: "journal" as const, label: "日记", icon: NotebookText },
  { id: "goals" as const, label: "目标", icon: Target }
];

export function BottomNav({
  tab,
  onNavigate,
  onRecord,
  showRecord
}: {
  tab: Tab;
  onNavigate: (tab: Tab) => void;
  onRecord: () => void;
  showRecord: boolean;
}) {
  return (
    <>
      {showRecord && (
        <button className="mobile-record-fab" onClick={onRecord} aria-label="记录一餐">
          <Camera size={22} strokeWidth={2} />
        </button>
      )}
      <nav className="bottom-nav" aria-label="移动端导航">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={tab === item.id ? "is-active" : ""}
              onClick={() => onNavigate(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
            >
              <Icon size={21} strokeWidth={1.9} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
