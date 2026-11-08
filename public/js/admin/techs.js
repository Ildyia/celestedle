import { API_BASE_URL } from "../api.js";
import { el, byId } from "../dom.js";
import { formatDuration, formatNumber } from "../format.js";
import { admin } from "./client.js";

const MODE_LABELS = { tech: "Mode normal", "tech-hard": "Mode Hard" };
const ACCESS_LABELS = { staff: "réservé à l'équipe admin", playtest: "ouvert aux playtesters", public: "ouvert à tous" };
const MAX_MEDIA_BYTES = 3 * 1024 * 1024;

// Champs du formulaire ↔ champs d'une tech
const FIELDS = [
  { input: "tech-category", field: "category", list: "tech-category-values" },
  { input: "tech-utility", field: "utility", list: "tech-utility-values" },
  { input: "tech-dash", field: "dash_required", list: "tech-dash-values" },
  { input: "tech-hardcoded", field: "hardcoded", list: "tech-hardcoded-values" }
];

export function techMediaUrl(tech) {
  return `${API_BASE_URL}/tech-media/${encodeURIComponent(tech.nom)}?v=${encodeURIComponent(tech.media ?? "")}`;
}

function stat(label, value) {
  return el("div", {}, [el("strong", { text: String(value ?? 0) }), el("span", { text: label })]);
}

// Techs : tech du jour, accès, liste et formulaire d'édition
export class TechsTab {
  constructor({ notify }) {
    this.notify = notify;
    this.techs = [];
    this.editing = null; // null = création
    this.removeMedia = false;

    this.form = byId("tech-form");
    byId("techs-search").addEventListener("input", () => this.renderList());
    byId("new-tech-btn").addEventListener("click", () => this.edit(null));
    byId("tech-cancel-btn").addEventListener("click", () => this.closeForm());
    byId("techs-access").addEventListener("change", (e) => this.setAccess(e.target));
    byId("tech-media-file").addEventListener("change", () => this.previewFile());
    byId("tech-media-remove").addEventListener("click", () => {
      this.removeMedia = true;
      this.showPreview(null);
      byId("tech-media-remove").hidden = true;
    });
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.save();
    });
  }

  async load() {
    const data = await admin.techs();
    this.techs = data.techs;
    byId("techs-access").value = data.access;
    byId("tech-difficulty").replaceChildren(...data.difficulties.map((d) => el("option", { text: d, attrs: { value: d } })));
    // Valeurs déjà utilisées, proposées à la saisie
    for (const { field, list } of FIELDS) {
      const values = [...new Set(this.techs.map((t) => t[field]))].sort();
      byId(list).replaceChildren(...values.map((v) => el("option", { attrs: { value: v } })));
    }
    this.renderToday(data.today);
    this.renderList();
  }

  async setAccess(select) {
    try {
      const { access } = await admin.setTechsAccess(select.value);
      this.notify(`Les techs sont maintenant ${ACCESS_LABELS[access]}.`);
    } catch (err) {
      this.notify(err.message, true);
      await this.load();
    }
  }

  renderToday(today) {
    byId("techs-today").replaceChildren(
      ...Object.entries(today).map(([mode, { secret, stats }]) => {
        const input = el("input", {
          className: "bug-input",
          attrs: { type: "text", list: "tech-names", placeholder: "Nom d'une tech", "aria-label": "Tech à imposer" }
        });
        const act = async (action) => {
          try {
            this.renderToday(await admin.setTechSecret(mode, action, input.value.trim()));
            this.notify(`${MODE_LABELS[mode]} : nouvelle tech du jour. Les parties en cours repartent à zéro.`);
          } catch (err) {
            this.notify(err.message, true);
          }
        };
        return el("div", { className: "admin-card mode-card" }, [
          el("h3", { text: `Tech du jour · ${MODE_LABELS[mode]}` }),
          el("div", { className: "mode-secret" }, [
            secret.hasMedia ? el("img", { attrs: { src: techMediaUrl({ nom: secret.nom }), alt: "" } }) : null,
            el("div", {}, [
              el("strong", { text: secret.nom }),
              el("p", {
                className: "small-subtext",
                text: `${secret.source === "admin" ? "Choisie par l'admin" : "Tirage automatique"} · version ${secret.version}`
              })
            ])
          ]),
          el("div", { className: "mode-stats" }, [
            stat("joueurs", stats.players),
            stat("victoires", stats.wins),
            stat("abandons", stats.forfeits),
            stat("défaites", stats.losses),
            stat("en cours", stats.playing),
            stat("essais moy.", formatNumber(stats.avgTries)),
            stat("indices moy.", formatNumber(stats.avgHints)),
            stat("temps moy.", formatDuration(stats.avgSeconds))
          ]),
          el("div", { className: "mode-actions" }, [
            el("button", { className: "btn-secondary", text: "Tirer une autre tech", attrs: { type: "button" }, on: { click: () => act("random") } }),
            input,
            el("button", { className: "btn-primary", text: "Imposer cette tech", attrs: { type: "button" }, on: { click: () => act("set") } })
          ])
        ]);
      }),
      el("datalist", { attrs: { id: "tech-names" } }, this.techs.filter((t) => t.isActive).map((t) => el("option", { attrs: { value: t.nom } })))
    );
  }

  renderList() {
    const query = byId("techs-search").value.trim().toLowerCase();
    const rows = this.techs.filter((t) => [t.nom, ...t.aliases].some((n) => n.toLowerCase().includes(query)));
    byId("techs-body").replaceChildren(
      ...rows.map((tech) =>
        el(
          "tr",
          {
            className: ["clickable", tech.isActive ? "" : "inactive", this.editing?.id === tech.id ? "selected" : ""].join(" "),
            on: { click: () => this.edit(tech) }
          },
          [
            el("td", {}, [
              tech.media ? el("img", { className: "word-thumb", attrs: { src: techMediaUrl(tech), alt: "", loading: "lazy" } }) : null
            ]),
            el("td", { text: tech.nom }),
            el("td", { text: tech.category }),
            el("td", { text: tech.difficulty }),
            el("td", { text: tech.utility }),
            el("td", { text: tech.dash_required }),
            el("td", { text: tech.hardcoded })
          ]
        )
      )
    );
  }

  edit(tech) {
    this.editing = tech;
    this.removeMedia = false;
    byId("tech-form-title").textContent = tech ? `Modifier « ${tech.nom} »` : "Nouvelle tech";
    byId("tech-name").value = tech?.nom ?? "";
    byId("tech-aliases").value = tech?.aliases.join(", ") ?? "";
    byId("tech-difficulty").value = tech?.difficulty ?? "Beginner";
    for (const { input, field } of FIELDS) byId(input).value = tech?.[field] ?? "";
    byId("tech-media-file").value = "";
    this.showPreview(tech?.media ? techMediaUrl(tech) : null);
    byId("tech-media-remove").hidden = !tech?.media;
    byId("tech-active").checked = tech?.isActive ?? true;
    this.form.hidden = false;
    this.renderList();
    byId("tech-name").focus();
  }

  closeForm() {
    this.editing = null;
    this.form.hidden = true;
    this.renderList();
  }

  showPreview(src) {
    const preview = byId("tech-media-preview");
    URL.revokeObjectURL(this.previewUrl ?? "");
    preview.hidden = !src;
    if (src) preview.src = src;
  }

  previewFile() {
    const file = byId("tech-media-file").files[0];
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      this.notify("L'image doit faire 3 Mo au plus.", true);
      byId("tech-media-file").value = "";
      return;
    }
    this.previewUrl = URL.createObjectURL(file);
    this.showPreview(this.previewUrl);
    this.removeMedia = false;
  }

  async save() {
    const payload = {
      name: byId("tech-name").value.trim(),
      aliases: byId("tech-aliases").value,
      difficulty: byId("tech-difficulty").value,
      ...Object.fromEntries(FIELDS.map(({ input, field }) => [field, byId(input).value.trim()])),
      isActive: byId("tech-active").checked
    };
    try {
      let saved = this.editing ? await admin.updateTech(this.editing.id, payload) : await admin.createTech(payload);
      // L'image part après la tech : il faut son identifiant
      const file = byId("tech-media-file").files[0];
      if (file) saved = await admin.uploadTechMedia(saved.id, file);
      else if (this.removeMedia && saved.media) saved = await admin.deleteTechMedia(saved.id);
      this.notify(`« ${saved.nom} » enregistrée.`);
      await this.load();
      this.edit(this.techs.find((t) => t.id === saved.id));
    } catch (err) {
      this.notify(err.message, true);
    }
  }
}
