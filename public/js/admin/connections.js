import { spriteUrl } from "../api.js";
import { el, byId, clear } from "../dom.js";
import { admin } from "./client.js";
import { openReply, repliesNote } from "./reply.js";

const KIND_LABELS = { type: "Type", colour: "Colour", shape: "Shape", chapter: "Chapter", tag: "Tag" };

// Connections : relecture des grilles à venir et édition des tags
export class ConnectionsTab {
  constructor({ notify }) {
    this.notify = notify;
    this.tags = [];
    this.elements = [];
    this.editing = null; // null = création
    this.fromSuggestion = null; // suggestion à retirer une fois le tag créé
    this.checked = new Set();
    this.confirmDelete = false;

    this.form = byId("cx-tag-form");
    byId("new-tag-btn").addEventListener("click", () => this.edit(null));
    byId("cx-access").addEventListener("change", (e) => this.setAccess(e.target));
    byId("cx-tag-cancel-btn").addEventListener("click", () => this.closeForm());
    byId("cx-tag-search").addEventListener("input", () => this.renderElements());
    byId("cx-tag-delete-btn").addEventListener("click", () => this.remove());
    byId("cx-diagnose-btn").addEventListener("click", () => this.diagnose());
    byId("export-tags-btn").addEventListener("click", () => this.exportTags());
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.save();
    });
  }

  // Chaque bloc se charge à part : une erreur sur les grilles n'empêche pas
  // d'afficher les tags, et dit d'où elle vient
  async load() {
    admin
      .connectionsAccess()
      .then(({ access }) => (byId("cx-access").value = access))
      .catch((err) => this.notify(`Couldn't load access: ${err.message}`, true));
    const [tags, elements, puzzles, suggestions] = await Promise.allSettled([
      admin.connectionTags(),
      admin.elements(),
      admin.connectionPuzzles(),
      admin.connectionSuggestions()
    ]);
    const errors = [];
    if (elements.status === "fulfilled") this.elements = elements.value.elements.filter((e) => e.isActive);
    else errors.push(`elements: ${elements.reason.message}`);
    if (tags.status === "fulfilled") {
      this.tags = tags.value;
      this.renderTags();
    } else errors.push(`tags: ${tags.reason.message}`);
    if (puzzles.status === "fulfilled") this.renderPuzzles(puzzles.value);
    else errors.push(`grids: ${puzzles.reason.message}`);
    if (suggestions.status === "fulfilled") this.renderSuggestions(suggestions.value);
    else errors.push(`suggestions: ${suggestions.reason.message}`);
    if (errors.length) this.notify(`Couldn't load ${errors.join("; ")}`, true);
  }

  // Export des tags en JSON (pour tester le générateur ailleurs) : éléments
  // donnés par leur nom, les identifiants pouvant changer d'une base à l'autre
  exportTags() {
    const names = new Map(this.elements.map((e) => [e.id, e.nom]));
    const named = (ids) => ids.map((id) => names.get(id)).filter(Boolean).sort();
    const data = {
      exportedAt: new Date().toISOString(),
      tags: this.tags.map((tag) => ({
        label: tag.label,
        description: tag.description,
        elements: named(tag.elementIds),
        unreviewed: named(tag.unreviewedIds)
      }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = el("a", { attrs: { href: url, download: `connections-tags-${data.exportedAt.slice(0, 10)}.json` } });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.notify(`${data.tags.length} tags exported.`);
  }

  // Diagnostic des tags (src/services/connections.js, tagDiagnostics)
  async diagnose() {
    const button = byId("cx-diagnose-btn");
    const box = byId("cx-diagnostics");
    button.disabled = true;
    clear(box);
    box.append(el("p", { className: "small-subtext", text: "Drawing test grids… (about 30 seconds)" }));
    try {
      this.renderDiagnostics(await admin.connectionTagDiagnostics());
    } catch (err) {
      clear(box);
      this.notify(`Couldn't run the diagnostics: ${err.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  renderDiagnostics({ summary, tags, others }) {
    const box = byId("cx-diagnostics");
    clear(box);
    const pct = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : "0%");
    const rejected = (s) => s.rejected.decoy + s.rejected.incompatible;
    const line = (name, s) =>
      `${name}: ${s.trials} test grids in ${(s.ms / 1000).toFixed(1)} s` +
      (s.failed ? `, ${s.failed} impossible` : "") +
      (name === "A-Side" ? ` · ${s.rules.strict} without any decoy, ${s.rules.relaxed} with a fallback rule (a colour, shape or chapter decoy allowed)` : "");
    box.append(
      el("p", { className: "small-subtext", text: line("A-Side", summary.normal) }),
      el("p", { className: "small-subtext", text: line("B-Side", summary.hard) })
    );
    const total = rejected(summary.normal);
    const blocks = (t) => t.decoy + t.incompatible;
    const statusText = { ok: "OK", unreviewed: "Incomplete", "too small": "Under 4", "too big": "Over 40" };
    box.append(
      el("div", { className: "admin-table-wrapper" }, [
        el("table", { className: "admin-table compact" }, [
          el("thead", {}, [
            el("tr", {}, ["Tag", "Elements", "Status", "Blocks (A)", "Picked in tests A / B", "Daily grids", "Found", "Overlaps most with"].map((t) => el("th", { text: t })))
          ]),
          el(
            "tbody",
            {},
            tags.map((t) =>
              el("tr", {}, [
                el("td", { text: t.label }),
                el("td", { text: String(t.size) }),
                el("td", { text: statusText[t.status] ?? t.status }),
                el("td", { text: pct(blocks(t.trials.normal), total), attrs: { title: `${t.trials.normal.decoy} decoy, ${t.trials.normal.incompatible} too few elements of its own` } }),
                el("td", { text: `${t.trials.normal.picked} / ${t.trials.hard.picked}` }),
                el("td", { text: String(t.daily.grids) }),
                el("td", { text: t.daily.players ? pct(t.daily.found, t.daily.players) : "-" }),
                el("td", { text: t.overlap ? `${t.overlap.label} (${KIND_LABELS[t.overlap.kind] ?? t.overlap.kind}): ${t.overlap.shared} of ${t.size} shared` : "-" })
              ])
            )
          )
        ])
      ])
    );
    if (others.length) {
      box.append(
        el("p", {
          className: "small-subtext",
          text: "Other categories that block the most (A-Side): " + others.map((o) => `${o.label} (${KIND_LABELS[o.kind] ?? o.kind}) ${pct(o.decoy + o.incompatible, total)}`).join(", ")
        })
      );
    }
  }

  async setAccess(select) {
    const labels = { staff: "admin team only", playtest: "open to playtesters", public: "open to everyone" };
    try {
      const { access } = await admin.setConnectionsAccess(select.value);
      this.notify(`Connections is now ${labels[access]}.`);
    } catch (err) {
      this.notify(err.message, true);
      const { access } = await admin.connectionsAccess();
      select.value = access;
    }
  }

  renderPuzzles(puzzles) {
    const container = byId("cx-puzzles");
    clear(container);
    container.append(
      ...puzzles.map((puzzle) =>
        puzzle.error
          ? el("div", { className: "admin-card cx-admin-puzzle" }, [
              el("strong", { text: `${puzzle.date} ${puzzle.mode === "hard" ? "Hard" : "Normal"}` }),
              el("p", { className: "text-wrong", text: `Can't show this grid: ${puzzle.error}` }),
              el("button", {
                className: "btn-secondary btn-small",
                text: "Redraw",
                attrs: { type: "button" },
                on: { click: (e) => this.regenerate(puzzle.date, puzzle.mode, e.currentTarget) }
              })
            ])
          : el("div", { className: "admin-card cx-admin-puzzle" }, [
          el("div", { className: "cx-admin-puzzle-head" }, [
            el("strong", { text: puzzle.date }),
            el("span", { className: `badge cx-mode-${puzzle.mode}`, text: puzzle.mode === "hard" ? "Hard" : "Normal" }),
            // Mode normal tiré avec une règle assouplie : faux groupes possibles
            puzzle.mode === "normal" && ["relaxed", "none"].includes(puzzle.rule)
              ? el("span", {
                  className: "badge",
                  text: "decoys possible",
                  attrs: { title: "No grid without decoys was found: redraw it or review the tags" }
                })
              : null,
            el("span", {
              className: `badge${puzzle.source === "admin" ? " admin" : ""}`,
              text: puzzle.source === "admin" ? `redrawn (v${puzzle.version})` : "auto"
            }),
            el("button", {
              className: "btn-secondary btn-small",
              text: "Redraw",
              attrs: { type: "button", title: "Draws another grid; today's games start over" },
              on: { click: (e) => this.regenerate(puzzle.date, puzzle.mode, e.currentTarget) }
            })
          ]),
          ...puzzle.groups.map((group) =>
            el("div", { className: `cx-admin-group level-${group.level}` }, [
              el("strong", { text: group.label }),
              el("span", { className: "cx-admin-kind", text: KIND_LABELS[group.kind] }),
              el("div", { text: group.members.join(", ") })
            ])
          )
        ])
      )
    );
  }

  // Le tirage peut prendre quelques secondes (dans le worker, derrière une
  // préparation ou un diagnostic en cours) : le bouton le dit
  async regenerate(date, mode, button) {
    const label = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = "Drawing…";
    }
    try {
      const puzzle = await admin.regenerateConnectionPuzzle(date, mode);
      this.notify(`New ${mode === "hard" ? "Hard" : "Normal"} grid for ${date} (v${puzzle.version}).`);
      this.renderPuzzles(await admin.connectionPuzzles());
    } catch (err) {
      this.notify(err.message, true);
      if (button) {
        button.disabled = false;
        button.textContent = label;
      }
    }
  }

  renderSuggestions(suggestions) {
    const container = byId("cx-suggestions");
    clear(container);
    if (suggestions.length === 0) {
      container.append(el("p", { className: "small-subtext", text: "No suggestions yet." }));
      return;
    }
    container.append(
      ...suggestions.map((suggestion) =>
        el("div", { className: "admin-card cx-admin-suggestion" }, [
          el("div", { className: "cx-admin-puzzle-head" }, [
            el("strong", { text: suggestion.label }),
            el("span", {
              className: "small-subtext",
              text: `${suggestion.playerName ?? "Deleted profile"}, ${suggestion.createdAt.slice(0, 10)}`
            })
          ]),
          suggestion.elements ? el("p", { text: `Elements: ${suggestion.elements}` }) : null,
          suggestion.note ? el("p", { className: "small-subtext", text: `How to decide: ${suggestion.note}` }) : null,
          repliesNote(suggestion.replies),
          el("div", { className: "modal-actions" }, [
            suggestion.hasAuthor
              ? el("button", {
                  className: "btn-secondary btn-small",
                  text: "Reply",
                  attrs: { type: "button", title: `Write to ${suggestion.playerName} in their mailbox` },
                  on: { click: () => this.replySuggestion(suggestion) }
                })
              : null,
            el("button", {
              className: "btn-secondary btn-small",
              text: "Dismiss",
              attrs: { type: "button" },
              on: { click: () => this.dismissSuggestion(suggestion) }
            }),
            el("button", {
              className: "btn-primary btn-small",
              text: "Create this tag",
              attrs: { type: "button" },
              on: { click: () => this.editFromSuggestion(suggestion) }
            })
          ])
        ])
      )
    );
  }

  // Formulaire prérempli : les noms cités qui correspondent à un élément sont cochés
  // Lettre personnelle à l'auteur de la suggestion
  replySuggestion(suggestion) {
    openReply({
      heading: `Reply to ${suggestion.playerName}`,
      context: `Tag idea: ${suggestion.label}${suggestion.elements ? ` (${suggestion.elements})` : ""}`,
      title: `About your tag idea "${suggestion.label}"`,
      send: async (letter) => {
        await admin.replyToSuggestion(suggestion.id, letter);
        this.notify(`Letter sent to ${suggestion.playerName}.`);
        await this.load();
      }
    });
  }

  editFromSuggestion(suggestion) {
    this.edit(null);
    this.fromSuggestion = suggestion;
    const cited = new Set(
      suggestion.elements
        .split(/[,;\n]+/)
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
    );
    this.checked = new Set(this.elements.filter((e) => cited.has(e.nom.toLowerCase())).map((e) => e.id));
    byId("cx-tag-label").value = suggestion.label;
    byId("cx-tag-description").value = suggestion.note;
    this.renderElements();
    this.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async dismissSuggestion(suggestion) {
    try {
      await admin.deleteConnectionSuggestion(suggestion.id);
      this.notify(`Suggestion "${suggestion.label}" dismissed.`);
      this.renderSuggestions(await admin.connectionSuggestions());
    } catch (err) {
      this.notify(err.message, true);
    }
  }

  renderTags() {
    const body = byId("cx-tags-body");
    clear(body);
    if (this.tags.length === 0) {
      body.append(el("tr", {}, [el("td", { text: "No tags yet.", attrs: { colspan: 3 } })]));
      return;
    }
    body.append(
      ...this.tags.map((tag) => {
        const count = tag.elementIds.length;
        const types = new Set(this.elements.filter((e) => tag.elementIds.includes(e.id)).map((e) => e.type));
        const state =
          tag.unreviewedIds.length > 0
            ? { text: `${tag.unreviewedIds.length} element(s) to sort`, className: "badge" }
            : count < 4 || count > 40
              ? { text: "Out of bounds (4 to 40)", className: "badge" }
              : types.size === 1
                ? { text: "Single type: will never come out", className: "badge" }
                : { text: "Used in grids", className: "badge admin" };
        return el(
          "tr",
          { className: `clickable${this.editing?.id === tag.id ? " selected" : ""}`, on: { click: () => this.edit(tag) } },
          [
            el("td", {}, [
              el("strong", { text: tag.label }),
              el("div", { className: "small-subtext", text: tag.description }),
              el("div", {
                className: "cx-tag-members",
                text: this.elements
                  .filter((e) => tag.elementIds.includes(e.id))
                  .map((e) => e.nom)
                  .sort((a, b) => a.localeCompare(b))
                  .join(", ")
              })
            ]),
            el("td", { text: String(count) }),
            el("td", {}, [el("span", state)])
          ]
        );
      })
    );
  }

  edit(tag) {
    this.editing = tag;
    this.fromSuggestion = null;
    this.checked = new Set(tag?.elementIds ?? []);
    this.confirmDelete = false;
    byId("cx-tag-form-title").textContent = tag ? `Edit "${tag.label}"` : "New tag";
    byId("cx-tag-label").value = tag?.label ?? "";
    byId("cx-tag-description").value = tag?.description ?? "";
    byId("cx-tag-search").value = "";
    byId("cx-tag-delete-btn").hidden = !tag;
    byId("cx-tag-delete-btn").textContent = "Delete";
    this.form.hidden = false;
    this.renderElements();
    this.renderTags();
    byId("cx-tag-label").focus();
  }

  closeForm() {
    this.editing = null;
    this.form.hidden = true;
    this.renderTags();
  }

  // Tous les éléments jouables, cochés ou non : enregistrer = tout classer
  renderElements() {
    const query = byId("cx-tag-search").value.trim().toLowerCase();
    const unreviewed = new Set(this.editing?.unreviewedIds ?? []);
    const container = byId("cx-tag-elements");
    clear(container);
    container.append(
      ...this.elements
        .filter((e) => e.nom.toLowerCase().includes(query))
        .map((element) =>
          el(
            "button",
            {
              className: `cx-tag-element${unreviewed.has(element.id) ? " unreviewed" : ""}`,
              attrs: {
                type: "button",
                "aria-pressed": String(this.checked.has(element.id)),
                title: unreviewed.has(element.id) ? "New element, not sorted for this tag yet" : element.nom
              },
              on: { click: () => this.toggle(element.id) }
            },
            [el("img", { attrs: { src: spriteUrl(element.nom), alt: "", loading: "lazy" } }), el("span", { text: element.nom })]
          )
        )
    );
    const size = this.checked.size;
    const warning = size > 40 ? ": more than 40, this tag will never come out" : size > 0 && size < 4 ? ": it needs at least 4" : "";
    byId("cx-tag-count").textContent = `(${size} ticked out of ${this.elements.length}${warning})`;
  }

  toggle(id) {
    if (this.checked.has(id)) this.checked.delete(id);
    else this.checked.add(id);
    this.renderElements();
  }

  async save() {
    const payload = {
      label: byId("cx-tag-label").value.trim(),
      description: byId("cx-tag-description").value.trim(),
      elementIds: [...this.checked]
    };
    try {
      const saved = this.editing
        ? await admin.updateConnectionTag(this.editing.id, payload)
        : await admin.createConnectionTag(payload);
      const suggestion = this.fromSuggestion;
      if (suggestion) await admin.deleteConnectionSuggestion(suggestion.id, saved.label).catch(() => {});
      this.notify(
        `Tag "${saved.label}" saved.${suggestion?.hasAuthor ? ` ${suggestion.playerName} gets a letter: their idea is in the game.` : ""}`
      );
      await this.load();
      this.edit(this.tags.find((t) => t.id === saved.id));
    } catch (err) {
      this.notify(err.message, true);
    }
  }

  // Premier clic : confirmation ; second clic : suppression
  async remove() {
    if (!this.confirmDelete) {
      this.confirmDelete = true;
      byId("cx-tag-delete-btn").textContent = "Confirm deletion";
      return;
    }
    try {
      await admin.deleteConnectionTag(this.editing.id);
      this.notify(`Tag "${this.editing.label}" deleted.`);
      this.closeForm();
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    }
  }
}
