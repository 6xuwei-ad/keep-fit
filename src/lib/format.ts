export function dateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12);
}

export function shiftDateKey(key: string, offset: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatDate(key: string, withWeekday = true): string {
  const date = parseDateKey(key);
  const text = `${date.getMonth() + 1}月${date.getDate()}日`;
  return withWeekday ? `${text} · ${WEEKDAYS[date.getDay()]}` : text;
}

export function friendlyDate(key: string, today = dateKey()): string {
  if (key === today) return "今天";
  if (key === shiftDateKey(today, -1)) return "昨天";
  return formatDate(key);
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}
