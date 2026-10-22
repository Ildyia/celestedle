import { el, byId } from "../dom.js";
import { admin } from "./client.js";

const STATUS_LABELS = {
  new: "Nouveau",
  working: "En cours",
  fixed: "Corrigé",
  cant_reproduce: "Non reproductible",
  wrong: "Report erroné"
};

// Ordre d'avancement, pour trier par statut
const STATUS_ORDER = ["new", "working", "cant_reproduce", "wrong", "fixed"];
const OPEN = ["new", "working"];

const COLUMNS = [
  { key: "id", label: "ID" },
  { key: "elementName", label: "Élément" },
  { key: "bugType", label: "Type" },
  { key: "description", label: "Description", sortable: false },
  { key: "reporter", label: "Auteur", sortable: false },
  { key: "score", label: "Votes" },
  { key: "createdAt", label: "Date" },
  { key: "status", label: "Statut" },
  { key: "actions", label: "", sortable: false }
];

const sortValue = {
  status: (r) => STATUS_ORDER.indexOf(r.status),
  score: (r) => r.score,
  createdAt: (r) => r.createdAt ?? "",
  id: (r) => r.id,
  elementName: (r) => r.elementName ?? "",
  bugType: (r) => r.bugType
};

// Tous les reports : filtre par statut, tri par colonne, suppression.
// Les changements de statut sont répercutés sur Discord.
export class ReportsTab {
  constructor({ notify }) {
    this.notify = notify;
    this.reports = [];
    this.statuses = [];
    this.sortKey = "status";
    this.sortDesc = false;
    this.pendingDelete = null;

    byId("reports-status-filter").addEventListener("change", () => this.render());
    byId("purge-closed-btn").addEventListener("click", () => this.purgeClosed());
  }

  async load() {
    const { reports, statuses } = await admin.reports();
    this.reports = reports;
    this.statuses = statuses;
    this.render();
  }

  sorted() {
    const filter = byId("reports-status-filter").value;
    const value = sortValue[this.sortKey];
    return this.reports
      .filter((r) => !filter || (filter === "open" ? OPEN.includes(r.status) : r.status === filter))
      .sort((a, b) => {
        const va = value(a);
        const vb = value(b);
        const order = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
        // À statut égal : les plus votés d'abord
        const tie = this.sortKey === "status" ? b.score - a.score : 0;
        return (this.sortDesc ? -order : order) || tie;
      });
  }

  renderHead() {
    byId("reports-head").replaceChildren(
      el(
        "tr",
        {},
        COLUMNS.map((c) => {
          const active = c.key === this.sortKey;
          if (c.sortable === false) return el("th", { text: c.label });
          return el("th", {
            text: `${c.label}${active ? (this.sortDesc ? " ▼" : " ▲") : ""}`,
            attrs: { scope: "col", "aria-sort": active ? (this.sortDesc ? "descending" : "ascending") : "none" },
            on: {
              click: () => {
                this.sortDesc = active ? !this.sortDesc : c.key === "score" || c.key === "createdAt";
                this.sortKey = c.key;
                this.render();
              }
            }
          });
        })
      )
    );
  }

  reporterCell(report) {
    if (!report.reporter) return el("td", { className: "small-subtext", text: "-" });
    return el("td", {}, [
      el("div", { text: report.reporter.name }),
      report.reporter.discordTag
        ? el("div", { className: "badge", text: `Discord : ${report.reporter.discordTag}` })
        : el("div", { className: "small-subtext", text: "pas de Discord" })
    ]);
  }

  statusSelect(report) {
    const select = el(
      "select",
      {
        className: "bug-input",
        attrs: { "aria-label": `Statut de ${report.id}` },
        on: {
          change: async (e) => {
            try {
              await admin.setReportStatus(report.id, e.target.value);
              report.status = e.target.value;
              this.notify(`${report.id} : ${STATUS_LABELS[report.status]}.`);
              this.render();
            } catch (err) {
              this.notify(err.message, true);
              e.target.value = report.status;
            }
          }
        }
      },
      this.statuses.map((s) => el("option", { text: STATUS_LABELS[s] ?? s, attrs: { value: s } }))
    );
    select.value = report.status;
    return select;
  }

  // Premier clic : demande confirmation ; second clic dans les 4 s : supprime
  deleteButton(report) {
    const confirming = this.pendingDelete === report.id;
    return el("button", {
      className: confirming ? "btn-danger btn-small" : "btn-secondary btn-small",
      text: confirming ? "Confirmer" : "Supprimer",
      attrs: { type: "button" },
      on: {
        click: async () => {
          if (!confirming) {
            this.pendingDelete = report.id;
            this.render();
            setTimeout(() => {
              if (this.pendingDelete === report.id) {
                this.pendingDelete = null;
                this.render();
              }
            }, 4000);
            return;
          }
          try {
            await admin.deleteReport(report.id);
            this.reports = this.reports.filter((r) => r.id !== report.id);
            this.pendingDelete = null;
            this.notify(`${report.id} supprimé.`);
            this.render();
          } catch (err) {
            this.notify(err.message, true);
          }
        }
      }
    });
  }

  render() {
    this.renderHead();
    byId("reports-body").replaceChildren(
      ...this.sorted().map((report) =>
        el("tr", { className: OPEN.includes(report.status) ? "" : "inactive" }, [
          el("td", { text: report.id }),
          el("td", { text: report.elementName ?? "-" }),
          el("td", { text: report.bugType }),
          el("td", { className: "description-cell", text: `${report.isSpoiler ? "[spoiler] " : ""}${report.description}` }),
          this.reporterCell(report),
          el("td", { className: "num", text: String(report.score) }),
          el("td", { text: report.createdAt?.slice(0, 10) ?? "-" }),
          el("td", {}, [this.statusSelect(report)]),
          el("td", {}, [this.deleteButton(report)])
        ])
      )
    );
  }

  async purgeClosed() {
    const button = byId("purge-closed-btn");
    if (button.dataset.confirm !== "true") {
      const count = this.reports.filter((r) => !OPEN.includes(r.status)).length;
      button.dataset.confirm = "true";
      button.textContent = `Confirmer la suppression de ${count} report(s) clos`;
      button.className = "btn-danger";
      setTimeout(() => this.resetPurgeButton(), 5000);
      return;
    }
    try {
      const { deleted } = await admin.purgeClosedReports();
      this.notify(`${deleted} report(s) clos supprimé(s).`);
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    }
    this.resetPurgeButton();
  }

  resetPurgeButton() {
    const button = byId("purge-closed-btn");
    button.dataset.confirm = "false";
    button.textContent = "Supprimer les reports clos";
    button.className = "btn-secondary";
  }
}
