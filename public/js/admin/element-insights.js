// Fiche Insights d'un élément : dans l'éditeur d'éléments (vue « Insights »)
// et dans l'onglet Insights (recherche d'un élément).
import { el } from "../dom.js";

const SIDES = { normal: "A-Side", hard: "B-Side" };
const KIND_NAMES = { type: "Type", colour: "Colour", shape: "Shape", chapter: "Chapter", tag: "Tag" };
const pct = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : "-");

function table(head, rows) {
  return el("table", { className: "admin-table compact" }, [
    el("thead", {}, [el("tr", {}, head.map((t) => el("th", { text: t })))]),
    el("tbody", {}, rows.map((cells) => el("tr", {}, cells.map((c) => el("td", { text: String(c) })))))
  ]);
}

const note = (text) => el("p", { className: "small-subtext", text });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Fiche d'un élément (src/repositories/insights.js, elementInsights) :
 * Celestedle (jours où il était la réponse, essais, duels) puis Connections
 * (grilles, pièges, tags). Toutes périodes, ou depuis `since`.
 */
export function renderElementInsights({ since, secrets, guesses, duels, connections, tags }) {
  const all = !since || since === "0000-01-01";
  const cx = connections.grids;
  return [
    el("h4", { text: "Celestedle" }),
    note(
      `Guessed ${plural(guesses.times, "time")} in ${plural(guesses.games, "game")}, ${guesses.openers ?? 0} as the first guess. ` +
        `Answer of ${duels} duel${duels === 1 ? "" : "s"}.`
    ),
    secrets.length
      ? table(
          ["Answer of", "Players", "Won", "Avg. tries"],
          secrets.map((s) => [`${s.date} · ${SIDES[s.mode]}`, s.players, pct(s.wins, s.players), s.avgCost ?? "-"])
        )
      : note(all ? "Never the answer of the day yet." : "Not the answer of the day in this period."),
    el("h4", { text: "Connections" }),
    note(
      `In ${cx.length} daily grid${cx.length === 1 ? "" : "s"}; put in a wrong group of 4 ${plural(connections.decoys, "time")}. ` +
        (tags.length ? `Tags: ${tags.join(", ")}.` : "No tag.")
    ),
    cx.length
      ? table(
          ["Grid", "Group", "Found"],
          cx.map((g) => [`${g.date} · ${SIDES[g.mode]}`, `${g.label} (${KIND_NAMES[g.kind] ?? g.kind})`, g.players ? `${pct(g.found, g.players)} (${g.found}/${g.players})` : "-"])
        )
      : note(all ? "Never in a daily grid yet." : "Not in a daily grid in this period.")
  ];
}
