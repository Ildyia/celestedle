import { el, clear } from "./dom.js";
import { capitalize, CATEGORY_LABELS } from "./format.js";

export const HINT_NAMES = {
  opposite: "Opposite",
  secret_info: "Secret Info",
  truth_and_lies: "1 Truth & 2 Lies"
};

function statementText({ category, value }) {
  return category === "shape" ? `Shape is "${value}"` : `${CATEGORY_LABELS[category]} includes "${value}"`;
}

function oppositeText(hint) {
  if (!hint.element) return "No opposite element found.";
  const categories = hint.categories.map((c) => CATEGORY_LABELS[c]);
  if (categories.length === 4) return `${capitalize(hint.element)} is a perfect opposite!`;
  if (categories.length === 0) return `${capitalize(hint.element)} shares something in every category.`;
  const list =
    categories.length === 1
      ? categories[0]
      : `${categories.slice(0, -1).join(", ")} and ${categories.at(-1)}`;
  return `${capitalize(hint.element)} is opposite to the word on ${list}.`;
}

function hintBody(hint) {
  if (hint.type === "opposite") return [el("p", { text: oppositeText(hint) })];
  if (hint.type === "secret_info") {
    const verb = hint.category === "lieu" ? "can be found in" : hint.partial ? "includes" : "is";
    return [
      el("p", {}, [
        `Its ${CATEGORY_LABELS[hint.category].toLowerCase()} ${verb}: `,
        el("strong", { text: hint.value })
      ])
    ];
  }
  return [el("ul", { className: "hint-statements" }, hint.statements.map((s) => el("li", { text: statementText(s) })))];
}

export function renderHints(container, hints) {
  clear(container);
  for (const hint of hints) {
    container.append(
      el("div", { className: "hint-card" }, [
        el("span", { className: "hint-card-title", text: HINT_NAMES[hint.type] }),
        ...hintBody(hint)
      ])
    );
  }
}

// Boutons de la fenêtre d'indices : un indice déjà utilisé est grisé, et
// tous le sont quand la limite du mode est atteinte
export function updateHintButtons(state) {
  const used = state.hints.map((h) => h.type);
  const left = Math.max(0, state.rules.maxHints - used.length);
  document.querySelectorAll("[data-hint-type]").forEach((btn) => {
    btn.disabled = used.includes(btn.dataset.hintType) || left === 0;
  });
  const label = document.getElementById("hint-btn-text");
  if (label) label.textContent = left > 0 ? `Hints (${left} left)` : "No hints left";
  const button = document.getElementById("hint-btn");
  if (button) button.disabled = left === 0 || state.status !== "playing";
  return left;
}
