// Onglet « Insights » : ce que jouent les gens (src/repositories/insights.js).
// Barres d'une seule teinte (une seule série chacune), valeur au survol et
// dans le texte quand elle compte ; le détail est dans des tableaux.
import { spriteUrl } from "../api.js";
import { el, byId, clear } from "../dom.js";
import { formatNumber } from "../format.js";
import { admin } from "./client.js";
import { renderElementInsights } from "./element-insights.js";

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : "-");
const HINT_NAMES = { opposite: "Opposite", secret_info: "Secret info", truth_and_lies: "Truth & lies", info: "Element Info" };
const STATUS_NAMES = { won: "Won", lost: "Lost", forfeit: "Gave up" };
const CX_HINT_NAMES = { kinds: "Kinds", category: "Category", pair: "Pair" };
const KIND_NAMES = { type: "Type", colour: "Colour", shape: "Shape", chapter: "Chapter", tag: "Tag" };
const SIDES = { normal: "A-Side", hard: "B-Side" };

function card(title, note, ...content) {
  return el("section", { className: "admin-card insights-card" }, [el("h3", { text: title }), note ? el("p", { className: "small-subtext", text: note }) : null, ...content]);
}

const empty = (text = "No games in this period.") => el("p", { className: "small-subtext", text });

// Un élément cité dans une carte : un clic ouvre sa fiche en haut de l'onglet
let openEntity = () => {};

function entityButton(name) {
  return el("button", { className: "insights-entity-link", text: capitalize(name), attrs: { type: "button", title: `Stats of ${capitalize(name)}` }, on: { click: () => openEntity(name) } });
}

function wordCell(name) {
  return el("td", { className: "insights-word" }, [el("img", { attrs: { src: spriteUrl(name), alt: "", loading: "lazy" } }), entityButton(name)]);
}

// Tableau des openers d'un mode
function openersTable(rows) {
  if (!rows.length) return empty();
  return el("table", { className: "admin-table compact" }, [
    el("thead", {}, [el("tr", {}, ["Opener", "Games", "Won", "Avg. tries"].map((t) => el("th", { text: t })))]),
    el("tbody", {}, rows.map((r) => el("tr", {}, [wordCell(r.name), el("td", { text: String(r.games) }), el("td", { text: pct(r.wins, r.games) }), el("td", { text: formatNumber(r.avgTries) })])))
  ]);
}

const wide = (node) => {
  node.classList.add("wide");
  return node;
};

// Openers les plus efficaces d'un mode : les moins d'essais pour gagner d'abord
function bestOpenersTable(rows, minGames) {
  if (!rows.length) return empty(`No opener played in ${minGames} finished games or more in this period.`);
  return el("table", { className: "admin-table compact" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Opener" }),
        el("th", { text: "Games" }),
        el("th", { text: "Won" }),
        el("th", { text: "Avg. tries", attrs: { title: "Tries to win, a hint counts as a try" } }),
        el("th", { text: "Greens", attrs: { title: "Categories right on the first guess, on average" } }),
        el("th", { text: "Clues", attrs: { title: "Categories right or partly right (green or yellow) on the first guess, on average" } })
      ])
    ]),
    el(
      "tbody",
      {},
      rows.map((r) =>
        el("tr", {}, [
          wordCell(r.name),
          el("td", { text: String(r.games) }),
          el("td", { text: pct(r.wins, r.games) }),
          el("td", { text: r.avgTries === null ? "-" : formatNumber(r.avgTries) }),
          el("td", { text: formatNumber(r.greens) }),
          el("td", { text: formatNumber(r.clues) })
        ])
      )
    )
  ]);
}

// Barres horizontales : libellé, barre, valeur
function hbars(rows, { label, value, format = String, title = (r) => `${label(r)}: ${format(value(r))}`, none }) {
  if (!rows.length) return empty(none);
  const max = Math.max(1, ...rows.map(value));
  return el(
    "div",
    { className: "insights-hbars" },
    rows.map((r) =>
      el("div", { className: "insights-hbar", attrs: { title: title(r) } }, [
        el("span", { className: "insights-label" }, [label(r)]),
        el("span", { className: "insights-track" }, [el("i", { attrs: { style: `width: ${(value(r) / max) * 100}%` } })]),
        el("span", { className: "insights-value", text: format(value(r)) })
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

// Connections, un mode : issues, erreurs des victoires, réussite par sorte
function cxModeCard(mode, m) {
  if (!m) return card(`Connections · ${SIDES[mode]}`, null, empty());
  const finished = m.outcomes.won + m.outcomes.lost;
  return card(
    `Connections · ${SIDES[mode]}`,
    `Wins by mistakes made; ${pct(m.hints, finished)} of finished grids used a hint.`,
    columns(m.mistakes, ["0", "1", "2", "3", "4"], { title: (l, v) => `${v} win${v === 1 ? "" : "s"} with ${l} mistake${l === "1" ? "" : "s"}` }),
    el("p", { className: "insights-outcomes" }, ["won", "lost"].map((s) => el("span", {}, [el("strong", { text: String(m.outcomes[s]) }), ` ${STATUS_NAMES[s]} (${pct(m.outcomes[s], finished)})`]))),
    el("p", { className: "small-subtext", text: "Groups found, by kind (share of finished grids where the group was found):" }),
    hbars(m.kinds, { label: (k) => KIND_NAMES[k.kind] ?? k.kind, value: (k) => Math.round((k.found / k.seen) * 100), format: (v) => `${v}%`, title: (k) => `${KIND_NAMES[k.kind] ?? k.kind}: found ${k.found} times out of ${k.seen}` })
  );
}

function hardestTable(rows) {
  if (!rows.length) return empty("Not enough players per grid yet.");
  return el("table", { className: "admin-table compact" }, [
    el("thead", {}, [el("tr", {}, ["Group", "Kind", "Grid", "Found"].map((t) => el("th", { text: t })))]),
    el("tbody", {}, rows.map((r) => el("tr", {}, [
      el("td", { text: r.label }),
      el("td", { text: KIND_NAMES[r.kind] ?? r.kind }),
      el("td", { text: `${r.date} · ${SIDES[r.mode]}` }),
      el("td", { text: `${pct(r.found, r.players)} (${r.found}/${r.players})` })
    ])))
  ]);
}

export class InsightsTab {
  constructor() {
    this.days = "30";
    this.elements = null; // nom (minuscules) → élément, chargé une fois
    this.entity = null; // élément dont la fiche est ouverte
    document.querySelectorAll("[data-days]").forEach((b) =>
      b.addEventListener("click", () => {
        this.days = b.dataset.days;
        this.load();
      })
    );
    const search = byId("insights-element");
    search.addEventListener("change", () => this.lookup(search.value));
    search.addEventListener("keydown", (e) => e.key === "Enter" && this.lookup(search.value));
    openEntity = (name) => {
      search.value = capitalize(name);
      this.lookup(name);
      byId("insights-element-card").scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  async loadElements() {
    if (this.elements) return;
    const { elements } = await admin.elements();
    this.elements = new Map(elements.map((e) => [e.nom.toLowerCase(), e]));
    byId("insights-element-names").replaceChildren(...elements.map((e) => el("option", { attrs: { value: capitalize(e.nom) } })));
  }

  async lookup(name) {
    await this.loadElements();
    const element = this.elements.get(String(name).trim().toLowerCase());
    if (!element) return;
    this.entity = element;
    await this.renderEntity();
  }

  // Fiche de l'élément choisi, sur la période de l'onglet
  async renderEntity() {
    const card = byId("insights-element-card");
    const element = this.entity;
    if (!element) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const period = { 7: "last 7 days", 30: "last 30 days" }[this.days] ?? "all time";
    const head = el("div", { className: "insights-entity-head" }, [
      el("img", { attrs: { src: spriteUrl(element.nom), alt: "" } }),
      el("h3", { text: `${capitalize(element.nom)} · ${period}` }),
      el("button", {
        className: "btn-secondary",
        text: "Close",
        attrs: { type: "button" },
        on: { click: () => { this.entity = null; byId("insights-element").value = ""; this.renderEntity(); } }
      })
    ]);
    card.replaceChildren(head, el("p", { className: "small-subtext", text: "Loading…" }));
    const data = await admin.elementInsights(element.id, this.days);
    if (this.entity !== element) return;
    card.replaceChildren(head, ...renderElementInsights(data));
  }

  async load() {
    document.querySelectorAll("[data-days]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.days === this.days)));
    const box = byId("insights");
    clear(box);
    box.append(el("p", { className: "small-subtext", text: "Loading…" }));
    this.loadElements().catch(() => {});
    if (this.entity) this.renderEntity();
    const data = await admin.insights(this.days);
    clear(box);
    const hintsTotal = data.gamesWithHints;
    box.append(
      card("Openers · A-Side", "First guess of each finished game, with how those games ended.", openersTable(data.openers.normal)),
      card("Openers · B-Side", null, openersTable(data.openers.hard)),
      wide(
        card(
          "Most effective openers",
          `Openers of ${data.bestOpeners.minGames}+ finished games, fewest tries to win first. Greens and clues: what the first guess tells, on average, out of 4 categories (green, or green and yellow).`,
          el("div", { className: "insights-split" }, [
            el("div", {}, [el("h4", { text: "A-Side" }), bestOpenersTable(data.bestOpeners.normal, data.bestOpeners.minGames)]),
            el("div", {}, [el("h4", { text: "B-Side" }), bestOpenersTable(data.bestOpeners.hard, data.bestOpeners.minGames)])
          ])
        )
      ),
      card("Most guessed", "Every guess, both sides of Celestedle.", hbars(data.mostGuessed, { label: (r) => entityButton(r.name), title: (r) => `${capitalize(r.name)}: ${r.times}`, value: (r) => r.times })),
      card("Wins by tries · A-Side", "A hint counts as a try.", triesColumns(data.tries.normal), outcomes(data.outcomes.normal)),
      card("Wins by tries · B-Side", null, triesColumns(data.tries.hard), outcomes(data.outcomes.hard)),
      card(
        "Hints · Celestedle",
        `${pct(hintsTotal.withHints ?? 0, hintsTotal.games)} of finished games used at least one hint.`,
        hbars(data.hints, { label: (r) => HINT_NAMES[r.type] ?? r.type, value: (r) => r.uses, none: "No hint used in this period." })
      ),
      cxModeCard("normal", data.connections.modes.normal),
      cxModeCard("hard", data.connections.modes.hard),
      card("Hardest Connections groups", "Lowest share of players who found the group (grids with 3 players or more).", hardestTable(data.connections.hardest)),
      card(
        "Connections decoys",
        "Entities most often put in a wrong group of 4.",
        hbars(data.connections.decoys, { label: (r) => entityButton(r.name), title: (r) => `${capitalize(r.name)}: ${r.times}`, value: (r) => r.times, none: "No mistakes in this period." })
      ),
      card(
        "Connections hints",
        null,
        hbars(data.connections.hints, { label: (r) => CX_HINT_NAMES[r.type] ?? r.type, value: (r) => r.uses, none: "No hint used in this period." })
      ),
      card(
        "When people finish",
        "Finished Celestedle and Connections games by hour, Paris time.",
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
              el("thead", {}, [el("tr", {}, ["Date", "Players", "Celestedle", "Connections"].map((t) => el("th", { text: t })))]),
              el("tbody", {}, data.days.map((d) => el("tr", {}, [d.date, d.players, d.celestedle, d.connections].map((v) => el("td", { text: String(v) })))))
            ])
          : empty()
      )
    );
    box.lastElementChild.classList.add("wide");
  }
}
