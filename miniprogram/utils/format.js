const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function pad(value) {
  return value < 10 ? `0${value}` : String(value);
}

function dateKey(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateKey(key) {
  const parts = String(key).split("-").map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1, 12);
}

function shiftDateKey(key, offset) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}

function formatDate(key, withWeekday) {
  const date = parseDateKey(key);
  const text = `${date.getMonth() + 1}月${date.getDate()}日`;
  if (withWeekday === false) return text;
  return `${text} · ${WEEKDAYS[date.getDay()]}`;
}

function monthDay(key) {
  const date = parseDateKey(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function friendlyDate(key) {
  const today = dateKey();
  if (key === today) return "今天";
  if (key === shiftDateKey(today, -1)) return "昨天";
  return formatDate(key);
}

function clock(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function round(value, digits) {
  const factor = Math.pow(10, digits || 0);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

module.exports = {
  dateKey,
  parseDateKey,
  shiftDateKey,
  formatDate,
  monthDay,
  friendlyDate,
  clock,
  greeting,
  round
};
