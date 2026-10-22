import { spriteUrl } from "../api.js";
import { el, byId } from "../dom.js";
import { admin } from "./client.js";

// Éditeur d'éléments : la liste à gauche, le formulaire à droite
export class ElementsTab {
  constructor({ notify }) {
    this.notify = notify;
    this.elements = [];
    this.vocabulary = null;
    this.editing = null; // null = création

    this.form = byId("element-form");
    byId("elements-search").addEventListener("input", () => this.renderList());
    byId("new-element-btn").addEventListener("click", () => this.edit(null));
    byId("element-cancel-btn").addEventListener("click", () => this.closeForm());
    byId("export-db-btn").addEventListener("click", () => this.exportDb());
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.save();
    });
  }

  async load() {
    const { elements, vocabulary } = await admin.elements();
    this.elements = elements;
    this.vocabulary = vocabulary;
    this.renderList();
  }

  renderList() {
    const query = byId("elements-search").value.trim().toLowerCase();
    const rows = this.elements.filter((e) => e.nom.toLowerCase().includes(query));
    byId("elements-body").replaceChildren(
      ...rows.map((element) =>
        el(
          "tr",
          {
            className: [
              "clickable",
              element.isActive ? "" : "inactive",
              this.editing?.id === element.id ? "selected" : ""
            ].join(" "),
            on: { click: () => this.edit(element) }
          },
          [
            el("td", {}, [el("img", { className: "word-thumb", attrs: { src: spriteUrl(element.nom), alt: "", loading: "lazy" } })]),
            el("td", { text: element.nom }),
            el("td", { text: element.type }),
            el("td", { text: element.shape }),
            el("td", { text: element.couleur.join(", ") }),
            el("td", { text: element.lieu.join(", ") }),
            el("td", {}, [
              el("span", {
                className: `badge${element.managedBy === "admin" ? " admin" : ""}`,
                text: element.managedBy === "admin" ? "admin" : "db.json"
              })
            ])
          ]
        )
      )
    );
  }

  options(select, values, current) {
    select.replaceChildren(...values.map((v) => el("option", { text: v, attrs: { value: v } })));
    select.value = current ?? values[0];
  }

  // Les valeurs cochées sont enregistrées dans l'ordre des cases
  checkboxes(container, name, values, selected) {
    container.replaceChildren(
      ...values.map((value) =>
        el("label", {}, [
          el("input", { attrs: { type: "checkbox", name, value, checked: selected.includes(value) } }),
          value
        ])
      )
    );
  }

  edit(element) {
    this.editing = element;
    const v = this.vocabulary;
    byId("element-form-title").textContent = element ? `Modifier « ${element.nom} »` : "Nouvel élément";
    byId("element-name").value = element?.nom ?? "";
    this.options(byId("element-type"), v.types, element?.type);
    this.options(byId("element-shape"), v.shapes, element?.shape);
    this.checkboxes(byId("element-colors"), "couleur", v.colors, element?.couleur ?? []);
    this.checkboxes(byId("element-locations"), "lieu", v.locations, element?.lieu ?? []);
    byId("element-sprite").value = element?.sprite ?? "";
    byId("element-active").checked = element?.isActive ?? true;
    this.form.hidden = false;
    this.renderList();
    byId("element-name").focus();
  }

  closeForm() {
    this.editing = null;
    this.form.hidden = true;
    this.renderList();
  }

  checked(name) {
    return [...this.form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  }

  async save() {
    const payload = {
      name: byId("element-name").value.trim(),
      type: byId("element-type").value,
      shape: byId("element-shape").value,
      couleur: this.checked("couleur"),
      lieu: this.checked("lieu"),
      sprite: byId("element-sprite").value.trim() || null,
      isActive: byId("element-active").checked
    };
    try {
      const saved = this.editing
        ? await admin.updateElement(this.editing.id, payload)
        : await admin.createElement(payload);
      this.notify(`« ${saved.nom} » enregistré.`);
      await this.load();
      this.edit(this.elements.find((e) => e.id === saved.id));
    } catch (err) {
      this.notify(err.message, true);
    }
  }

  async exportDb() {
    try {
      const data = await admin.exportDbJson();
      const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
      const link = el("a", { attrs: { href: URL.createObjectURL(blob), download: "db.json" } });
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      this.notify(err.message, true);
    }
  }
}
