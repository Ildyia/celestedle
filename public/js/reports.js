import { api } from "./api.js";
import { el, byId, clear, openModal, closeModal, debounce } from "./dom.js";
import { capitalize } from "./format.js";
import { player } from "./player.js";
import { showToast } from "./toast.js";

const STATUS_LABELS = {
  new: "🔴 New",
  working: "🟡 Working on it",
  fixed: "🟢 Fixed",
  cant_reproduce: "⚪ Can't reproduce",
  wrong: "🔴 Wrong report"
};

// Fenêtre « Report a bug » : on montre les reports proches pendant la saisie
// pour encourager à voter plutôt qu'à reposter
export class ReportsPanel {
  constructor({ getElements }) {
    this.getElements = getElements;
    this.reports = [];
    this.similar = [];
    this.confirmDuplicate = false;

    this.nodes = {
      form: byId("bug-form"),
      element: byId("bug-element-select"),
      type: byId("bug-type-select"),
      description: byId("bug-description-input"),
      spoiler: byId("bug-spoiler-checkbox"),
      similar: byId("similar-reports"),
      similarList: byId("similar-reports-list"),
      duplicate: byId("duplicate-warning"),
      submit: byId("submit-bug-btn"),
      list: byId("reports-list"),
      filter: byId("reports-filter")
    };

    byId("report-bug-btn")?.addEventListener("click", () => this.open());
    this.nodes.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submit();
    });
    const refreshSimilar = debounce(() => this.refreshSimilar(), 350);
    this.nodes.element.addEventListener("change", refreshSimilar);
    this.nodes.description.addEventListener("input", refreshSimilar);
    this.nodes.filter.addEventListener("change", () => this.renderList());
    byId("send-anyway-btn")?.addEventListener("click", () => this.submit(true));
  }

  async open() {
    this.fillElementSelects();
    this.reset();
    openModal("bug-modal");
    await this.loadReports();
  }

  reset() {
    this.nodes.form.reset();
    this.similar = [];
    this.confirmDuplicate = false;
    this.renderSimilar();
  }

  fillElementSelects() {
    const elements = [...this.getElements()].sort((a, b) => a.nom.localeCompare(b.nom));
    const options = (first) => [
      el("option", { text: first, attrs: { value: "" } }),
      ...elements.map((e) => el("option", { text: capitalize(e.nom), attrs: { value: e.nom } }))
    ];
    this.nodes.element.replaceChildren(...options("-- None / General bug --"));
    const current = this.nodes.filter.value;
    this.nodes.filter.replaceChildren(...options("All elements"));
    this.nodes.filter.value = current;
  }

  async loadReports() {
    try {
      const { reports, bugTypes } = await api.reports();
      this.reports = reports;
      if (this.nodes.type.options.length === 0) {
        this.nodes.type.replaceChildren(...bugTypes.map((t) => el("option", { text: t, attrs: { value: t } })));
      }
      this.renderList();
    } catch (err) {
      clear(this.nodes.list);
      this.nodes.list.append(el("p", { className: "small-subtext", text: err.message }));
    }
  }

  async refreshSimilar() {
    const elementName = this.nodes.element.value;
    const description = this.nodes.description.value;
    if (!elementName && description.trim().length < 8) {
      this.similar = [];
    } else {
      try {
        this.similar = await api.similarReports(elementName, description);
      } catch {
        this.similar = [];
      }
    }
    this.confirmDuplicate = false;
    this.renderSimilar();
  }

  renderSimilar() {
    const { similar, similarList, duplicate, submit } = this.nodes;
    similar.hidden = this.similar.length === 0;
    clear(similarList);
    similarList.append(...this.similar.map((r) => this.reportItem(r, { compact: true })));
    duplicate.hidden = !this.confirmDuplicate;
    submit.hidden = this.confirmDuplicate;
  }

  renderList() {
    const filter = this.nodes.filter.value;
    const shown = filter ? this.reports.filter((r) => r.elementName === filter) : this.reports;
    clear(this.nodes.list);
    if (shown.length === 0) {
      this.nodes.list.append(el("p", { className: "small-subtext", text: "No open reports here. 🎉" }));
      return;
    }
    this.nodes.list.append(...shown.map((r) => this.reportItem(r)));
  }

  reportItem(report, { compact = false } = {}) {
    const voteButton = (isUp) =>
      el("button", {
        className: `vote-btn${report.userVote === (isUp ? 1 : -1) ? " vote-active" : ""}`,
        text: isUp ? "👍" : "👎",
        attrs: {
          type: "button",
          "aria-label": isUp ? "Same problem for me" : "Not a problem",
          "aria-pressed": String(report.userVote === (isUp ? 1 : -1))
        },
        on: { click: () => this.vote(report.id, isUp) }
      });

    const description = el("p", {
      className: `report-description${report.isSpoiler ? " spoiler" : ""}`,
      text: report.description,
      attrs: report.isSpoiler ? { title: "Spoiler: click to reveal", tabindex: "0" } : {}
    });
    if (report.isSpoiler) {
      description.addEventListener("click", () => description.classList.remove("spoiler"));
    }

    return el("div", { className: `report-item${compact ? " compact" : ""}` }, [
      el("div", { className: "report-head" }, [
        el("strong", { text: report.elementName ? capitalize(report.elementName) : "General" }),
        el("span", { className: "report-type", text: report.bugType }),
        el("span", { className: "report-status", text: STATUS_LABELS[report.status] ?? report.status })
      ]),
      description,
      el("div", { className: "report-votes" }, [
        el("span", { className: "report-score", text: `Score: ${report.score}` }),
        voteButton(true),
        voteButton(false),
        compact ? el("span", { className: "small-subtext", text: "Same issue? Vote instead of posting." }) : null
      ])
    ]);
  }

  async vote(id, isUp) {
    try {
      await player.ensure();
      const updated = await api.voteReport(id, isUp);
      const replace = (list) => list.map((r) => (r.id === id ? updated : r));
      this.reports = replace(this.reports);
      this.similar = replace(this.similar);
      this.renderList();
      this.renderSimilar();
      showToast(updated.userVote ? "Thanks, your vote counts!" : "Vote removed.");
    } catch (err) {
      showToast(err.message);
    }
  }

  async submit(force = false) {
    if (!force && this.similar.length > 0 && !this.confirmDuplicate) {
      this.confirmDuplicate = true;
      this.renderSimilar();
      return;
    }
    try {
      const report = await api.sendReport({
        elementName: this.nodes.element.value || null,
        bugType: this.nodes.type.value,
        description: this.nodes.description.value,
        isSpoiler: this.nodes.spoiler.checked
      });
      showToast(`Report ${report.id} sent, thank you!`);
      closeModal("bug-modal");
    } catch (err) {
      showToast(err.message);
    }
  }
}
