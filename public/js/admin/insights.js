// Onglet « Insights » : ce que jouent les gens (src/repositories/insights.js).
// Barres d'une seule teinte (une seule série chacune), valeur au survol et
// dans le texte quand elle compte ; le détail est dans des tableaux.
import { spriteUrl } from "../api.js";
import { el, byId, clear } from "../dom.js";
import { formatNumber } from "../format.js";
import { admin } from "./client.js";

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : "-");
const HINT_NAMES = { opposite: "Opposite", secret_info: "Secret info", truth_and_lies: "Truth & lies", info: "Element Info" };
const STATUS_NAMES = { won: "Won", lost: "Lost", forfeit: "Gave up" };

function card(title, note, ...content) {
  return el("section", { className: "admin-card insights-card" }, [el("h3", { text: title }), note ? el("p", { className: "small-subtext", text: note }) : null, ...content]);
}

const empty = (text = "No games in this period.") => el("p", { className: "small-subtext", text });

function wordCell(name) {
  return el("td", { className: "insights-word" }, [el("img", { attrs: { src: spriteUrl(name), alt: "", loading: "lazy" } }), capitalize(name)]);
}

// Tableau des openers d'un mode
function openersTable(rows) {
  if (!rows.length) return empty();
  return el("table", { className: "admin-table compact" }, [
    el("thead", {}, [el("tr", {}, ["Opener", "Games", "Won", "Avg. tries"].map((t) => el("th", { text: t })))]),
    el("tbody", {}, rows.map((r) => el("tr", {}, [wordCell(r.name), el("td", { text: String(r.games) }), el("td", { text: pct(r.wins, r.games) }), el("td", { text: formatNumber(r.avgTries) })])))
  ]);
}

// Barres horizontales : libellé, barre, valeur
function hbars(rows, { label, value, title = (r) => `${label(r)}: ${value(r)}`, none }) {
  if (!rows.length) return empty(none);
  const max = Math.max(1, ...rows.map(value));
  return el(
    "div",
    { className: "insights-hbars" },
    rows.map((r) =>
      el("div", { className: "insights-hbar", attrs: { title: title(r) } }, [
        el("span", { className: "insights-label" }, [label(r)]),
        el("span", { className: "insights-track" }, [el("i", { attrs: { style: `width: ${(value(r) / max) * 100}%` } })]),
        el("span", { className: "insights-value", text: String(value(r)) })
      ])
    )
  );
}

// Colonnes verticales : une par valeur de l'axe, les étiquettes en dessous
function columns(values, labels, { title }) {
  const max = Math.max(1, ...values);
  if (!values.some(Boolean)) return empty();
  return el("div", { className: "insights-columns", attrs: { style: `--n: ${values.length}` } }, [
    ...values.map((v, i) =>
      el("span", { className: "insights-col", attrs: { title: title(labels[i], v) } }, [el("i", { attrs: { style: `height: ${(v / max) * 100}%` } })])
    ),
    ...labels.map((l) => el("span", { className: "insights-axis", text: l }))
  ]);
}

function triesColumns(rows) {
  const values = Array.from({ length: 10 }, (_, i) => rows.find((r) => r.cost === i + 1)?.games ?? 0);
  const labels = values.map((_, i) => (i === 9 ? "10+" : String(i + 1)));
  return columns(values, labels, { title: (l, v) => `${v} win${v === 1 ? "" : "s"} in ${l} tr${l === "1" ? "y" : "ies"}` });
}

function outcomes(rows) {
  const total = rows.reduce((s, r) => s + r.games, 0);
  return el("p", { className: "insights-outcomes" }, Object.keys(STATUS_NAMES).map((status) => {
    const n = rows.find((r) => r.status === status)?.games ?? 0;
    return el("span", {}, [el("strong", { text: String(n) }), ` ${STATUS_NAMES[status]} (${pct(n, total)})`]);
  }));
}

export class InsightsTab {
  constructor() {
    this.days = "30";
    document.querySelectorAll("[data-days]").forEach((b) =>
      b.addEventListener("click", () => {
        this.days = b.dataset.days;
        this.load();
      })
    );
  }

  async load() {
    document.querySelectorAll("[data-days]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.days === this.days)));
    const box = byId("insights");
    clear(box);
    box.append(el("p", { className: "small-subtext", text: "Loading…" }));
    const data = await admin.insights(this.days);
    clear(box);
    const hintsTotal = data.gamesWithHints;
    box.append(
      card("Openers · A-Side", "First guess of each finished game, with how those games ended.", openersTable(data.openers.normal)),
      card("Openers · B-Side", null, openersTable(data.openers.hard)),
      card("Most guessed", "Every guess, both sides of Celestedle.", hbars(data.mostGuessed, { label: (r) => capitalize(r.name), value: (r) => r.times })),
      card("Wins by tries · A-Side", "A hint counts as a try.", triesColumns(data.tries.normal), outcomes(data.outcomes.normal)),
      card("Wins by tries · B-Side", null, triesColumns(data.tries.hard), outcomes(data.outcomes.hard)),
      card(
        "Hints",
        `${pct(hintsTotal.withHints ?? 0, hintsTotal.games)} of finished games used at least one hint.`,
        hbars(data.hints, { label: (r) => HINT_NAMES[r.type] ?? r.type, value: (r) => r.uses, none: "No hint used in this period." })
      ),
      card(
        "When people finish",
        "Finished Celestedle and Techs games by hour, Paris time.",
        columns(data.hours, data.hours.map((_, h) => (h % 3 === 0 ? `${h}h` : "")), { title: (_, v) => `${v} games` })
      ),
      card(
        "Duels",
        null,
        el("p", { className: "insights-outcomes" }, [
          el("span", {}, [el("strong", { text: String(data.duels.rooms ?? 0) }), " rooms created"]),
          el("span", {}, [el("strong", { text: String(data.duels.played ?? 0) }), " played"]),
          el("span", {}, [el("strong", { text: String(data.duels.private ?? 0) }), " private"])
        ])
      ),
      card(
        "Day by day",
        "Games started each day; players across all games.",
        data.days.length
          ? el("table", { className: "admin-table compact" }, [
              el("thead", {}, [el("tr", {}, ["Date", "Players", "Celestedle", "Connections", "Techs"].map((t) => el("th", { text: t })))]),
              el("tbody", {}, data.days.map((d) => el("tr", {}, [d.date, d.players, d.celestedle, d.connections, d.techs].map((v) => el("td", { text: String(v) })))))
            ])
          : empty()
      )
    );
    box.lastElementChild.classList.add("wide");
  }
}
