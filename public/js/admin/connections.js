import { spriteUrl } from "../api.js";
import { el, byId, clear } from "../dom.js";
import { admin } from "./client.js";

const KIND_LABELS = { type: "Type", colour: "Couleur", shape: "Forme", chapter: "Chapitre", tag: "Tag" };

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
    byId("cx-tag-cancel-btn").addEventListener("click", () => this.closeForm());
    byId("cx-tag-search").addEventListener("input", () => this.renderElements());
    byId("cx-tag-delete-btn").addEventListener("click", () => this.remove());
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.save();
    });
  }

  // Chaque bloc se charge à part : une erreur sur les grilles n'empêche pas
  // d'afficher les tags, et dit d'où elle vient
  async load() {
    const [tags, elements, puzzles, suggestions] = await Promise.allSettled([
      admin.connectionTags(),
      admin.elements(),
      admin.connectionPuzzles(),
      admin.connectionSuggestions()
    ]);
    const errors = [];
    if (elements.status === "fulfilled") this.elements = elements.value.elements.filter((e) => e.isActive);
    else errors.push(`éléments : ${elements.reason.message}`);
    if (tags.status === "fulfilled") {
      this.tags = tags.value;
      this.renderTags();
    } else errors.push(`tags : ${tags.reason.message}`);
    if (puzzles.status === "fulfilled") this.renderPuzzles(puzzles.value);
    else errors.push(`grilles : ${puzzles.reason.message}`);
    if (suggestions.status === "fulfilled") this.renderSuggestions(suggestions.value);
    else errors.push(`suggestions : ${suggestions.reason.message}`);
    if (errors.length) this.notify(`Erreur en chargeant ${errors.join(" ; ")}`, true);
  }

  renderPuzzles(puzzles) {
    const container = byId("cx-puzzles");
    clear(container);
    container.append(
      ...puzzles.map((puzzle) =>
        puzzle.error
          ? el("div", { className: "admin-card cx-admin-puzzle" }, [
              el("strong", { text: `${puzzle.date} ${puzzle.mode === "hard" ? "Hard" : "Normal"}` }),
              el("p", { className: "text-wrong", text: `Impossible d'afficher cette grille : ${puzzle.error}` }),
              el("button", {
                className: "btn-secondary btn-small",
                text: "Régénérer",
                attrs: { type: "button" },
                on: { click: () => this.regenerate(puzzle.date, puzzle.mode) }
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
                  text: "faux groupes possibles",
                  attrs: { title: "Aucune grille sans faux groupe n'a été trouvée : régénère-la ou revois les tags" }
                })
              : null,
            el("span", {
              className: `badge${puzzle.source === "admin" ? " admin" : ""}`,
              text: puzzle.source === "admin" ? `régénérée (v${puzzle.version})` : "auto"
            }),
            el("button", {
              className: "btn-secondary btn-small",
              text: "Régénérer",
              attrs: { type: "button", title: "Tire une autre grille ; les parties du jour repartent de zéro" },
              on: { click: () => this.regenerate(puzzle.date, puzzle.mode) }
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

  async regenerate(date, mode) {
    try {
      await admin.regenerateConnectionPuzzle(date, mode);
      this.notify(`Nouvelle grille ${mode === "hard" ? "Hard" : "normale"} pour le ${date}.`);
      this.renderPuzzles(await admin.connectionPuzzles());
    } catch (err) {
      this.notify(err.message, true);
    }
  }

  renderSuggestions(suggestions) {
    const container = byId("cx-suggestions");
    clear(container);
    if (suggestions.length === 0) {
      container.append(el("p", { className: "small-subtext", text: "Aucune suggestion pour l'instant." }));
      return;
    }
    container.append(
      ...suggestions.map((suggestion) =>
        el("div", { className: "admin-card cx-admin-suggestion" }, [
          el("div", { className: "cx-admin-puzzle-head" }, [
            el("strong", { text: suggestion.label }),
            el("span", {
              className: "small-subtext",
              text: `${suggestion.playerName ?? "Profil supprimé"}, ${suggestion.createdAt.slice(0, 10)}`
            })
          ]),
          suggestion.elements ? el("p", { text: `Éléments : ${suggestion.elements}` }) : null,
          suggestion.note ? el("p", { className: "small-subtext", text: `Comment trancher : ${suggestion.note}` }) : null,
          el("div", { className: "modal-actions" }, [
            el("button", {
              className: "btn-secondary btn-small",
              text: "Écarter",
              attrs: { type: "button" },
              on: { click: () => this.dismissSuggestion(suggestion) }
            }),
            el("button", {
              className: "btn-primary btn-small",
              text: "Créer ce tag",
              attrs: { type: "button" },
              on: { click: () => this.editFromSuggestion(suggestion) }
            })
          ])
        ])
      )
    );
  }

  // Formulaire prérempli : les noms cités qui correspondent à un élément sont cochés
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
      this.notify(`Suggestion « ${suggestion.label} » écartée.`);
      this.renderSuggestions(await admin.connectionSuggestions());
    } catch (err) {
      this.notify(err.message, true);
    }
  }

  renderTags() {
    const body = byId("cx-tags-body");
    clear(body);
    if (this.tags.length === 0) {
      body.append(el("tr", {}, [el("td", { text: "Aucun tag pour l'instant.", attrs: { colspan: 3 } })]));
      return;
    }
    body.append(
      ...this.tags.map((tag) => {
        const count = tag.elementIds.length;
        const types = new Set(this.elements.filter((e) => tag.elementIds.includes(e.id)).map((e) => e.type));
        const state =
          tag.unreviewedIds.length > 0
            ? { text: `${tag.unreviewedIds.length} élément(s) à classer`, className: "badge" }
            : count < 4 || count > 40
              ? { text: "Hors limites (4 à 40)", className: "badge" }
              : types.size === 1
                ? { text: "Un seul type : ne sortira jamais", className: "badge" }
                : { text: "Utilisé dans les grilles", className: "badge admin" };
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
    byId("cx-tag-form-title").textContent = tag ? `Modifier « ${tag.label} »` : "Nouveau tag";
    byId("cx-tag-label").value = tag?.label ?? "";
    byId("cx-tag-description").value = tag?.description ?? "";
    byId("cx-tag-search").value = "";
    byId("cx-tag-delete-btn").hidden = !tag;
    byId("cx-tag-delete-btn").textContent = "Supprimer";
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
                title: unreviewed.has(element.id) ? "Nouvel élément, pas encore classé pour ce tag" : element.nom
              },
              on: { click: () => this.toggle(element.id) }
            },
            [el("img", { attrs: { src: spriteUrl(element.nom), alt: "", loading: "lazy" } }), el("span", { text: element.nom })]
          )
        )
    );
    const size = this.checked.size;
    const warning = size > 40 ? " : plus de 40, ce tag ne sortira jamais" : size > 0 && size < 4 ? " : il en faut au moins 4" : "";
    byId("cx-tag-count").textContent = `(${size} coché(s) sur ${this.elements.length}${warning})`;
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
      this.notify(`Tag « ${saved.label} » enregistré.`);
      if (this.fromSuggestion) await admin.deleteConnectionSuggestion(this.fromSuggestion.id).catch(() => {});
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
      byId("cx-tag-delete-btn").textContent = "Confirmer la suppression";
      return;
    }
    try {
      await admin.deleteConnectionTag(this.editing.id);
      this.notify(`Tag « ${this.editing.label} » supprimé.`);
      this.closeForm();
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    }
  }
}
