import { spriteUrl } from "../api.js";
import { el, byId } from "../dom.js";
import { formatNumber } from "../format.js";
import { admin } from "./client.js";

const COLUMNS = [
  { key: "name", label: "Mot" },
  { key: "timesPicked", label: "Tiré", numeric: true },
  { key: "lastPicked", label: "Dernière fois" },
  { key: "games", label: "Parties", numeric: true },
  { key: "winRate", label: "Victoires %", numeric: true },
  { key: "avgTries", label: "Essais moy.", numeric: true, format: formatNumber },
  { key: "timesGuessed", label: "Proposé", numeric: true },
  { key: "legacyDays", label: "Jours v1", numeric: true },
  { key: "legacyWins", label: "Victoires v1", numeric: true }
];

// Statistiques par élément, triables par colonne
export class WordsTab {
  constructor() {
    this.rows = [];
    this.sortKey = "timesPicked";
    this.sortDesc = true;
    byId("words-search").addEventListener("input", () => this.render());
  }

  async load() {
    const words = await admin.words();
    this.rows = words.map((w) => ({
      ...w,
      winRate: w.games ? Math.round((w.wins / w.games) * 100) : null
    }));
    this.renderHead();
    this.render();
  }

  renderHead() {
    byId("words-head").replaceChildren(
      el("tr", {}, [
        el("th", { text: "" }),
        ...COLUMNS.map((c) =>
          el("th", {
            text: `${c.label}${c.key === this.sortKey ? (this.sortDesc ? " ▼" : " ▲") : ""}`,
            attrs: { scope: "col", "aria-sort": c.key === this.sortKey ? (this.sortDesc ? "descending" : "ascending") : "none" },
            on: {
              click: () => {
                this.sortDesc = c.key === this.sortKey ? !this.sortDesc : c.numeric === true;
                this.sortKey = c.key;
                this.renderHead();
                this.render();
              }
            }
          })
        )
      ])
    );
  }

  render() {
    const query = byId("words-search").value.trim().toLowerCase();
    const { sortKey, sortDesc } = this;
    const rows = this.rows
      .filter((w) => w.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const va = a[sortKey] ?? -Infinity;
        const vb = b[sortKey] ?? -Infinity;
        const order = typeof va === "string" || typeof vb === "string"
          ? String(va).localeCompare(String(vb))
          : va - vb;
        return sortDesc ? -order : order;
      });

    byId("words-body").replaceChildren(
      ...rows.map((w) =>
        el("tr", { className: w.isActive ? "" : "inactive" }, [
          el("td", {}, [el("img", { className: "word-thumb", attrs: { src: spriteUrl(w.name), alt: "", loading: "lazy" } })]),
          ...COLUMNS.map((c) => {
            const value = c.format ? c.format(w[c.key]) : w[c.key];
            return el("td", { className: c.numeric ? "num" : "", text: value === null || value === undefined ? "-" : String(value) });
          })
        ])
      )
    );
  }
}
