export const CATEGORY_LABELS = {
  type: "Type",
  lieu: "Chapter",
  couleur: "Colour",
  shape: "Shape"
};

export function capitalize(text) {
  const value = String(text ?? "");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// 75 → "01:15" ; null → "-"
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "-";
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || value === 0) return "-";
  return Number(value).toFixed(digits);
}

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
