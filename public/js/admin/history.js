import { el, byId } from "../dom.js";
import { formatDuration, formatNumber } from "../format.js";
import { admin } from "./client.js";

let chart = null;

const cell = (text, numeric = false) =>
  el("td", { className: numeric ? "num" : "", text: text === null || text === undefined ? "-" : String(text) });

function renderChart(days) {
  if (!window.Chart) return;
  const dates = [...new Set(days.map((d) => d.date))].sort();
  const series = (mode, field) =>
    dates.map((date) => days.find((d) => d.date === date && d.mode === mode)?.[field] ?? 0);

  chart?.destroy();
  chart = new window.Chart(byId("history-chart"), {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        { label: "Joueurs (normal)", data: series("normal", "players"), borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.15)", fill: true, tension: 0.3 },
        { label: "Victoires (normal)", data: series("normal", "wins"), borderColor: "#10b981", tension: 0.3 },
        { label: "Joueurs (Hard)", data: series("hard", "players"), borderColor: "#ef4444", tension: 0.3 },
        { label: "Jamais finies (normal)", data: series("normal", "unfinished"), borderColor: "#f59e0b", borderDash: [4, 4], tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#f8fafc" } } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { beginAtZero: true, ticks: { color: "#94a3b8", precision: 0 }, grid: { color: "rgba(255,255,255,0.05)" } }
      }
    }
  });
}

export async function renderHistory() {
  const { days, legacy } = await admin.history();

  byId("history-body").replaceChildren(
    ...days.map((d) =>
      el("tr", {}, [
        cell(d.date),
        cell(d.mode),
        cell(d.word),
        cell(d.source === "admin" ? `admin (v${d.version})` : "auto"),
        cell(d.players, true),
        cell(d.wins, true),
        cell(d.forfeits, true),
        cell(d.losses, true),
        cell(d.unfinished, true),
        cell(formatNumber(d.avgTries), true),
        cell(formatDuration(d.avgSeconds), true)
      ])
    )
  );
  byId("legacy-body").replaceChildren(
    ...legacy.map((d) =>
      el("tr", {}, [
        cell(d.date),
        cell(d.word),
        cell(d.wins, true),
        cell(formatNumber(d.avgTries), true),
        cell(formatNumber(d.avgHints), true),
        cell(formatDuration(d.avgSeconds), true)
      ])
    )
  );
  renderChart(days);
}
