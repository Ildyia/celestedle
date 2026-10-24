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

  async load() {
    const [tags, { elements }, puzzles] = await Promise.all([
      admin.connectionTags(),
      admin.elements(),
      admin.connectionPuzzles()
    ]);
    this.tags = tags;
    this.elements = elements.filter((e) => e.isActive);
    this.renderTags();
    this.renderPuzzles(puzzles);
  }

  renderPuzzles(puzzles) {
    const container = byId("cx-puzzles");
    clear(container);
    container.append(
      ...puzzles.map((puzzle) =>
        el("div", { className: "admin-card cx-admin-puzzle" }, [
          el("div", { className: "cx-admin-puzzle-head" }, [
            el("strong", { text: puzzle.date }),
            el("span", {
              className: `badge${puzzle.source === "admin" ? " admin" : ""}`,
              text: puzzle.source === "admin" ? `régénérée (v${puzzle.version})` : "auto"
            }),
            el("button", {
              className: "btn-secondary btn-small",
              text: "Régénérer",
              attrs: { type: "button", title: "Tire une autre grille ; les parties du jour repartent de zéro" },
              on: { click: () => this.regenerate(puzzle.date) }
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

  async regenerate(date) {
    try {
      await admin.regenerateConnectionPuzzle(date);
      this.notify(`Nouvelle grille pour le ${date}.`);
      this.renderPuzzles(await admin.connectionPuzzles());
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
        const state =
          tag.unreviewedIds.length > 0
            ? { text: `${tag.unreviewedIds.length} élément(s) à classer`, className: "badge" }
            : count < 4 || count > 40
              ? { text: "Hors limites (4 à 40)", className: "badge" }
              : { text: "Utilisé dans les grilles", className: "badge admin" };
        return el(
          "tr",
          { className: `clickable${this.editing?.id === tag.id ? " selected" : ""}`, on: { click: () => this.edit(tag) } },
          [
            el("td", {}, [el("strong", { text: tag.label }), el("div", { className: "small-subtext", text: tag.description })]),
            el("td", { text: String(count) }),
            el("td", {}, [el("span", state)])
          ]
        );
      })
    );
  }

  edit(tag) {
    this.editing = tag;
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
    byId("cx-tag-count").textContent = `(${this.checked.size} coché(s) sur ${this.elements.length})`;
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
