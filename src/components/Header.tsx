import { CalendarDays, Camera, NotebookText, Target, House } from "lucide-react";
import { Logo } from "./Logo";
import type { Tab } from "../types";
import type { Profile } from "../../shared/types";
import { dateKey, formatDate } from "../lib/format";

const NAV = [
  { id: "home" as const, label: "今日", icon: House },
  { id: "journal" as const, label: "日记", icon: NotebookText },
  { id: "goals" as const, label: "目标", icon: Target }
];

export function Header({
  tab,
  profile,
  visionEnabled,
  onNavigate,
  onRecord
}: {
  tab: Tab;
  profile: Profile | null;
  visionEnabled: boolean;
  onNavigate: (tab: Tab) => void;
  onRecord: () => void;
}) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button className="brand-button" onClick={() => onNavigate("home")} aria-label="回到首页">
          <Logo />
        </button>

        <nav className="desktop-nav" aria-label="主导航">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "is-active" : ""}
              onClick={() => onNavigate(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <span className="header-date">
            <CalendarDays size={14} />
            {formatDate(dateKey(), false)}
          </span>
          {!visionEnabled && (
            <span className="mode-pill" title="配置 VISION_API_KEY 后可识别真实照片">
              <i />
              演示模式
            </span>
          )}
          <button className="record-button" onClick={onRecord}>
            <Camera size={17} strokeWidth={2} />
            记一餐
          </button>
          <button
            className="avatar-button"
            onClick={() => onNavigate("goals")}
            aria-label="个人目标"
          >
            {profile?.name?.slice(0, 1) || "食"}
          </button>
        </div>
      </div>
    </header>
  );
}
