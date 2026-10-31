import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import type {
  AnalysisResult,
  AppMeta,
  DaySummary,
  Meal,
  MealType,
  Profile
} from "../shared/types";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { AnalyzeOverlay } from "./components/AnalyzeOverlay";
import { Logo } from "./components/Logo";
import { Toast } from "./components/Toast";
import { HomeScreen } from "./screens/HomeScreen";
import { JournalScreen } from "./screens/JournalScreen";
import { GoalsScreen } from "./screens/GoalsScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { analyzeImage, deleteMeal, fetchDay, fetchMeta } from "./lib/api";
import { compressImage } from "./lib/image";
import { dateKey } from "./lib/format";
import type { Tab, ToastState } from "./types";

export default function App() {
  const today = dateKey();
  const [tab, setTab] = useState<Tab>("home");
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todaySummary, setTodaySummary] = useState<DaySummary | null>(null);
  const [journalDate, setJournalDate] = useState(today);
  const [journalSummary, setJournalSummary] = useState<DaySummary | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [suggestedMealType, setSuggestedMealType] = useState<MealType>("lunch");
  const [scanning, setScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback(
    (message: string, tone: "success" | "error" | "info" = "success") => {
      setToast({ id: Date.now(), message, tone });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!scanning) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [scanning]);

  const boot = useCallback(async () => {
    setBootLoading(true);
    setBootError(null);
    try {
      const [metaData, day] = await Promise.all([fetchMeta(), fetchDay(today)]);
      setMeta(metaData);
      setProfile(day.profile);
      setTodaySummary(day.summary);
      setJournalSummary(day.summary);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "无法连接到食刻服务");
    } finally {
      setBootLoading(false);
    }
  }, [today]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const refreshToday = useCallback(async () => {
    try {
      const day = await fetchDay(today);
      setProfile(day.profile);
      setTodaySummary(day.summary);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "今日数据刷新失败", "error");
    }
  }, [today, pushToast]);

  const loadJournal = useCallback(
    async (date: string) => {
      setJournalLoading(true);
      try {
        const day = await fetchDay(date);
        setJournalSummary(day.summary);
        setProfile(day.profile);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "日记加载失败", "error");
      } finally {
        setJournalLoading(false);
      }
    },
    [pushToast]
  );

  useEffect(() => {
    if (tab !== "journal") return;
    if (journalSummary?.date === journalDate) return;
    void loadJournal(journalDate);
  }, [tab, journalDate, journalSummary?.date, loadJournal]);

  const openCamera = useCallback(() => {
    cameraRef.current?.click();
  }, []);

  const openGallery = useCallback(() => {
    galleryRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (scanning) return;
      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(localPreview);
      setScanning(true);
      setAnalysis(null);

      try {
        const compressed = await compressImage(file);
        const result = await analyzeImage(compressed);
        setAnalysis(result.analysis);
        setSuggestedMealType(result.suggestedMealType);
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        window.setTimeout(() => {
          setScanning(false);
          setPreviewUrl(null);
          URL.revokeObjectURL(localPreview);
        }, 420);
      } catch (error) {
        setScanning(false);
        setPreviewUrl(null);
        URL.revokeObjectURL(localPreview);
        pushToast(error instanceof Error ? error.message : "识别失败，请换一张照片", "error");
      }
    },
    [scanning, pushToast]
  );

  const handleDemo = useCallback(async () => {
    try {
      const response = await fetch("/images/demo-bowl.jpg");
      if (!response.ok) throw new Error("示例图片加载失败");
      const blob = await response.blob();
      const file = new File([blob], "demo-bowl.jpg", { type: "image/jpeg" });
      await handleFile(file);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "示例加载失败", "error");
    }
  }, [handleFile, pushToast]);

  const navigate = useCallback(
    (next: Tab) => {
      setTab(next);
      if (next === "journal") {
        setJournalDate(today);
        setJournalSummary((current) => (current?.date === today ? current : null));
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [today]
  );

  const handleSaved = useCallback(
    async (meal: Meal) => {
      setAnalysis(null);
      setPreviewUrl(null);
      setTab("journal");
      setJournalDate(today);
      setJournalSummary(null);
      await Promise.all([refreshToday(), loadJournal(today)]);
      pushToast(`${meal.name} 已加入今日饮食 · ${Math.round(meal.totals.kcal)} kcal`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [loadJournal, pushToast, refreshToday, today]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("删除这条饮食记录？删除后无法恢复。")) return;
      try {
        await deleteMeal(id);
        await Promise.all([
          loadJournal(journalDate),
          journalDate === today ? refreshToday() : Promise.resolve()
        ]);
        pushToast("这条记录已删除", "info");
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "删除失败", "error");
      }
    },
    [journalDate, loadJournal, pushToast, refreshToday, today]
  );

  const handleProfileSaved = useCallback(
    async (updated: Profile) => {
      setProfile(updated);
      await refreshToday();
      if (tab === "journal") await loadJournal(journalDate);
    },
    [journalDate, loadJournal, refreshToday, tab]
  );

  const closeReview = useCallback(() => {
    setAnalysis(null);
    setPreviewUrl(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (analysis && profile) {
    return (
      <>
        <ReviewScreen
          analysis={analysis}
          profile={profile}
          suggestedMealType={suggestedMealType}
          onBack={closeReview}
          onSaved={handleSaved}
          onToast={pushToast}
        />
        {scanning && <AnalyzeOverlay imageUrl={previewUrl} />}
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <div className="ambient-grain" aria-hidden="true" />
      <Header
        tab={tab}
        profile={profile}
        visionEnabled={meta?.visionEnabled ?? false}
        onNavigate={navigate}
        onRecord={openCamera}
      />

      <main className="app-main">
        {bootLoading ? (
          <BootScreen />
        ) : bootError || !profile ? (
          <ErrorScreen message={bootError ?? "个人资料加载失败"} onRetry={() => void boot()} />
        ) : tab === "home" ? (
          <HomeScreen
            profile={profile}
            summary={todaySummary}
            meta={meta}
            loading={!todaySummary}
            onCamera={openCamera}
            onGallery={openGallery}
            onDemo={() => void handleDemo()}
            onFile={(file) => void handleFile(file)}
            onOpenJournal={() => navigate("journal")}
            onRecord={openCamera}
          />
        ) : tab === "journal" ? (
          <JournalScreen
            date={journalDate}
            summary={journalSummary}
            profile={profile}
            loading={journalLoading}
            onDateChange={(date) => {
              setJournalDate(date);
              setJournalSummary(null);
            }}
            onRecord={openCamera}
            onDelete={(id) => void handleDelete(id)}
          />
        ) : (
          <GoalsScreen
            profile={profile}
            onSaved={(updated) => void handleProfileSaved(updated)}
            onToast={pushToast}
          />
        )}
      </main>

      {!bootLoading && !bootError && profile && (
        <footer className="site-footer">
          <div>
            <Logo compact />
            <span>食物是生活的刻度，不是焦虑的来源。</span>
          </div>
          <p>营养值为估算 · 不替代医疗建议 · SHIKE v1.0</p>
        </footer>
      )}

      <BottomNav
        tab={tab}
        onNavigate={navigate}
        onRecord={openCamera}
        showRecord={tab !== "home" && !bootLoading && Boolean(profile)}
      />

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />

      {scanning && <AnalyzeOverlay imageUrl={previewUrl} />}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function BootScreen() {
  return (
    <div className="boot-screen">
      <Logo />
      <div className="boot-screen__line">
        <span />
      </div>
      <p>正在准备你的餐盘…</p>
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-screen">
      <span className="error-screen__icon">
        <AlertCircle size={28} />
      </span>
      <span className="eyebrow">CONNECTION LOST</span>
      <h1>还没有连上食刻</h1>
      <p>{message}</p>
      <div className="error-screen__hint">
        <code>npm run dev</code>
        <span>同时启动 API 与网页，然后再试一次</span>
      </div>
      <button className="button button--primary" onClick={onRetry}>
        <RotateCcw size={16} />
        重新连接
      </button>
      <LoaderCircle size={14} className="error-screen__spin" />
    </div>
  );
}
