import { el } from "./dom.js";

export function showToast(message, duration = 2400) {
  const toast = el("div", { className: "toast-notification", text: message, attrs: { role: "status" } });
  document.body.append(toast);
  setTimeout(() => toast.remove(), duration);
}
