import { el, clear } from "./dom.js";
import { capitalize } from "./format.js";
import { CELESTEDLE } from "./catalogs.js";

export const HINT_NAMES = {
  opposite: "Opposite",
  secret_info: "Secret Info",
  truth_and_lies: "1 Truth & 2 Lies",
  info: "Element Info"
};

// Type et forme n'ont qu'une valeur ; chapitres et couleurs peuvent en avoir plusieurs
function statementText(catalog, { category, value }) {
  const verb = catalog.multiValued.includes(category) ? "includes" : "is";
  return `${catalog.labels[category]} ${verb} "${value}"`;
}

const NOTHING_NEW = "You already know everything this hint could tell you.";

function oppositeText(catalog, hint) {
  if (!hint.element) return `No opposite ${catalog.noun} found.`;
  const categories = hint.categories.map((c) => catalog.labels[c]);
  if (categories.length === catalog.categories.length) return `${capitalize(hint.element)} is a perfect opposite!`;
  if (categories.length === 0) return `${capitalize(hint.element)} shares something in every category.`;
  const list =
    categories.length === 1
      ? categories[0]
      : `${categories.slice(0, -1).join(", ")} and ${categories.at(-1)}`;
  return `${capitalize(hint.element)} is opposite to the word on ${list}.`;
}

function hintBody(catalog, hint) {
  if (hint.type === "opposite") return [el("p", { text: oppositeText(catalog, hint) })];
  if (hint.type === "secret_info") {
    if (!hint.category) return [el("p", { text: NOTHING_NEW })];
    const verb = hint.category === "lieu" ? "can be found in" : hint.partial ? "includes" : "is";
    return [
      el("p", {}, [
        `Its ${catalog.labels[hint.category].toLowerCase()} ${verb}: `,
        el("strong", { text: hint.value })
      ])
    ];
  }
  if (hint.type === "info") {
    return [
      el("p", {}, [el("strong", { text: capitalize(hint.element) })]),
      el(
        "ul",
        { className: "hint-statements" },
        Object.entries(hint.values).map(([category, value]) =>
          el("li", { text: `${catalog.labels[category]}: ${value || "none"}` })
        )
      )
    ];
  }
  if (hint.statements.length === 0) return [el("p", { text: NOTHING_NEW })];
  return [el("ul", { className: "hint-statements" }, hint.statements.map((s) => el("li", { text: statementText(catalog, s) })))];
}

export function renderHints(container, hints, catalog = CELESTEDLE) {
  clear(container);
  for (const hint of hints) {
    container.append(
      el("div", { className: "hint-card" }, [
        el("span", { className: "hint-card-title", text: catalog.hintNames[hint.type] ?? HINT_NAMES[hint.type] }),
        ...hintBody(catalog, hint)
      ])
    );
  }
}

// Nom court d'un indice bonus sur le bouton (« Info available »)
const BONUS_LABELS = { info: "Info" };

// Boutons de la fenêtre d'indices : un indice déjà utilisé est grisé, et
// tous le sont quand la limite du mode est atteinte, sauf les indices bonus
// du mode (rules.bonusHints) qui ne comptent pas dans la limite
export function updateHintButtons(state) {
  const used = state.hints.map((h) => h.type);
  const bonus = state.rules.bonusHints ?? [];
  const left = Math.max(0, state.rules.maxHints - used.filter((t) => !bonus.includes(t)).length);
  const bonusAvailable = bonus.filter((t) => !used.includes(t));
  const bonusLeft = bonusAvailable.length;
  document.querySelectorAll("[data-hint-type]").forEach((btn) => {
    const type = btn.dataset.hintType;
    btn.disabled = used.includes(type) || (left === 0 && !bonus.includes(type));
  });
  const label = document.getElementById("hint-btn-text");
  if (label) {
    label.textContent =
      left > 0
        ? `Hints (${left} left)`
        : bonusLeft > 0
          ? `${bonusAvailable.map((t) => BONUS_LABELS[t] ?? HINT_NAMES[t]).join(" + ")} available`
          : "No hints left";
  }
  const button = document.getElementById("hint-btn");
  // Pastille du téléphone, où le texte du bouton est caché (modern.css)
  if (button) button.dataset.left = String(left + bonusLeft);
  if (button) button.disabled = (left === 0 && bonusLeft === 0) || state.status !== "playing";
  return left + bonusLeft;
}
