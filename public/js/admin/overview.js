import { spriteUrl } from "../api.js";
import { el, byId } from "../dom.js";
import { formatDuration, formatNumber } from "../format.js";
import { admin } from "./client.js";

const MODE_LABELS = { normal: "Mode normal", hard: "Mode Hard" };
const KIND_LABELS = { type: "Type", colour: "Couleur", shape: "Forme", chapter: "Chapitre", tag: "Tag" };

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
    attrs: { type: "text", list: "element-names", placeholder: "Nom d'un élément", "aria-label": "Élément à imposer" }
  });

  const act = async (action) => {
    try {
      const result = await admin.setSecret(mode, action, input.value.trim());
      notify(`${MODE_LABELS[mode]} : nouveau mot « ${result.nom} ». Les parties en cours repartent à zéro.`);
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
          text: `${secret.source === "admin" ? "Choisi par l'admin" : "Tirage automatique"} · version ${secret.version}`
        })
      ])
    ]),
    el("div", { className: "mode-stats" }, [
      stat("joueurs", stats.players),
      stat("victoires", stats.wins),
      stat("abandons", stats.forfeits),
      stat("défaites", stats.losses),
      stat("en cours", stats.playing),
      stat("essais moy.", formatNumber(stats.avgTries)),
      stat("indices moy.", formatNumber(stats.avgHints)),
      stat("temps moy.", formatDuration(stats.avgSeconds))
    ]),
    el("div", { className: "mode-actions" }, [
      el("button", { className: "btn-secondary", text: "Tirer un autre mot", attrs: { type: "button" }, on: { click: () => act("random") } }),
      input,
      el("button", { className: "btn-primary", text: "Imposer ce mot", attrs: { type: "button" }, on: { click: () => act("set") } })
    ])
  ]);
}

// Connections : grille du jour, chiffres et régénération
function connectionsCard(mode, { puzzle, stats }, { notify, refresh }) {
  const regenerate = async () => {
    if (!window.confirm(`Tirer une autre grille ${mode === "hard" ? "Hard" : "normale"} ? Les parties du jour repartent de zéro.`)) return;
    try {
      await admin.regenerateConnectionPuzzle(puzzle.date, mode);
      notify(`Connections ${MODE_LABELS[mode].toLowerCase()} : nouvelle grille. Les parties en cours repartent à zéro.`);
      refresh();
    } catch (err) {
      notify(err.message, true);
    }
  };

  const grid = puzzle.error
    ? [el("p", { className: "text-wrong", text: `Impossible d'afficher la grille : ${puzzle.error}` })]
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
        : `${puzzle.source === "admin" ? `Régénérée (v${puzzle.version})` : "Tirage automatique"}${
            mode === "normal" && ["relaxed", "none"].includes(puzzle.rule) ? " · faux groupes possibles" : ""
          }`
    }),
    el("div", { className: "cx-overview-groups" }, grid),
    el("div", { className: "mode-stats" }, [
      stat("joueurs", stats.players),
      stat("victoires", stats.wins),
      stat("défaites", stats.losses),
      stat("en cours", stats.playing),
      stat("taux de victoire", stats.winRate === null ? "-" : `${stats.winRate} %`),
      stat("erreurs moy.", formatNumber(stats.avgMistakes)),
      stat("indices moy.", formatNumber(stats.avgHints)),
      stat("temps moy.", formatDuration(stats.avgSeconds))
    ]),
    el("div", { className: "mode-actions" }, [
      el("button", { className: "btn-secondary", text: "Tirer une autre grille", attrs: { type: "button" }, on: { click: regenerate } })
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
    kpi("Parties aujourd'hui", players),
    kpi("Profils créés", data.totalPlayers),
    kpi("Délai de répétition", `${data.repeatDelayDays} j`)
  );
  byId("overview-modes").replaceChildren(
    ...Object.entries(data.modes).map(([mode, info]) => modeCard(mode, info, { notify, refresh }))
  );
  byId("overview-connections").replaceChildren(
    ...Object.entries(data.connections).map(([mode, info]) => connectionsCard(mode, info, { notify, refresh }))
  );
  fillElementNames().catch(() => {});
}
