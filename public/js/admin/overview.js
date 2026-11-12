import { spriteUrl } from "../api.js";
import { el, byId } from "../dom.js";
import { formatDuration, formatNumber } from "../format.js";
import { admin } from "./client.js";

const MODE_LABELS = { normal: "Normal mode", hard: "Hard mode" };
const KIND_LABELS = { type: "Type", colour: "Colour", shape: "Shape", chapter: "Chapter", tag: "Tag" };

function kpi(label, value) {
  return el("div", { className: "admin-kpi-card" }, [el("h4", { text: label }), el("p", { text: String(value) })]);
}

function stat(label, value) {
  return el("div", {}, [el("strong", { text: String(value ?? 0) }), el("span", { text: label })]);
}

async function fillElementNames() {
  const list = byId("element-names");
  if (list.childElementCount > 0) return;
  const { elements } = await admin.elements();
  list.append(
    ...elements.filter((e) => e.isActive).map((e) => el("option", { attrs: { value: e.nom } }))
  );
}

function modeCard(mode, { secret, stats }, { notify, refresh }) {
  const input = el("input", {
    className: "bug-input",
    attrs: { type: "text", list: "element-names", placeholder: "Element name", "aria-label": "Element to set" }
  });

  const act = async (action) => {
    try {
      const result = await admin.setSecret(mode, action, input.value.trim());
      notify(`${MODE_LABELS[mode]}: new word "${result.nom}". Games in progress start over.`);
      refresh();
    } catch (err) {
      notify(err.message, true);
    }
  };

  return el("div", { className: "admin-card mode-card" }, [
    el("h3", { text: MODE_LABELS[mode] }),
    el("div", { className: "mode-secret" }, [
      el("img", { attrs: { src: spriteUrl(secret.nom), alt: "" } }),
      el("div", {}, [
        el("strong", { text: secret.nom }),
        el("p", {
          className: "small-subtext",
          text: `${secret.source === "admin" ? "Chosen by the admin" : "Automatic draw"} · version ${secret.version}`
        })
      ])
    ]),
    el("div", { className: "mode-stats" }, [
      stat("players", stats.players),
      stat("wins", stats.wins),
      stat("forfeits", stats.forfeits),
      stat("losses", stats.losses),
      stat("in progress", stats.playing),
      stat("avg. tries", formatNumber(stats.avgTries)),
      stat("avg. hints", formatNumber(stats.avgHints)),
      stat("avg. time", formatDuration(stats.avgSeconds))
    ]),
    el("div", { className: "mode-actions" }, [
      el("button", { className: "btn-secondary", text: "Draw another word", attrs: { type: "button" }, on: { click: () => act("random") } }),
      input,
      el("button", { className: "btn-primary", text: "Set this word", attrs: { type: "button" }, on: { click: () => act("set") } })
    ])
  ]);
}

// Connections : grille du jour, chiffres et régénération
function connectionsCard(mode, { puzzle, stats }, { notify, refresh }) {
  const regenerate = async () => {
    if (!window.confirm(`Draw another ${mode === "hard" ? "Hard" : "Normal"} grid? Today's games start over.`)) return;
    try {
      await admin.regenerateConnectionPuzzle(puzzle.date, mode);
      notify(`Connections ${MODE_LABELS[mode]}: new grid. Games in progress start over.`);
      refresh();
    } catch (err) {
      notify(err.message, true);
    }
  };

  const grid = puzzle.error
    ? [el("p", { className: "text-wrong", text: `Can't show the grid: ${puzzle.error}` })]
    : puzzle.groups.map((group) =>
        el("div", { className: `cx-admin-group level-${group.level}` }, [
          el("strong", { text: group.label }),
          el("span", { className: "cx-admin-kind", text: KIND_LABELS[group.kind] ?? group.kind }),
          el("div", { text: group.members.join(", ") })
        ])
      );

  return el("div", { className: "admin-card mode-card" }, [
    el("h3", { text: MODE_LABELS[mode] }),
    el("p", {
      className: "small-subtext",
      text: puzzle.error
        ? ""
        : `${puzzle.source === "admin" ? `Redrawn (v${puzzle.version})` : "Automatic draw"}${
            mode === "normal" && ["relaxed", "none"].includes(puzzle.rule) ? " · decoys possible" : ""
          }`
    }),
    el("div", { className: "cx-overview-groups" }, grid),
    el("div", { className: "mode-stats" }, [
      stat("players", stats.players),
      stat("wins", stats.wins),
      stat("losses", stats.losses),
      stat("in progress", stats.playing),
      stat("win rate", stats.winRate === null ? "-" : `${stats.winRate} %`),
      stat("avg. mistakes", formatNumber(stats.avgMistakes)),
      stat("avg. hints", formatNumber(stats.avgHints)),
      stat("avg. time", formatDuration(stats.avgSeconds))
    ]),
    el("div", { className: "mode-actions" }, [
      el("button", { className: "btn-secondary", text: "Draw another grid", attrs: { type: "button" }, on: { click: regenerate } })
    ])
  ]);
}

export async function renderOverview({ notify }) {
  const data = await admin.overview();
  const refresh = () => renderOverview({ notify }).catch((err) => notify(err.message, true));
  const players = [...Object.values(data.modes), ...Object.values(data.connections)].reduce(
    (sum, m) => sum + (m.stats.players || 0),
    0
  );

  byId("overview-kpis").replaceChildren(
    kpi("Date", data.date),
    kpi("Games today", players),
    kpi("Profiles created", data.totalPlayers),
    kpi("Repeat delay", `${data.repeatDelayDays} d`)
  );
  byId("overview-modes").replaceChildren(
    ...Object.entries(data.modes).map(([mode, info]) => modeCard(mode, info, { notify, refresh }))
  );
  byId("overview-connections").replaceChildren(
    ...Object.entries(data.connections).map(([mode, info]) => connectionsCard(mode, info, { notify, refresh }))
  );
  fillElementNames().catch(() => {});
}
