import { spriteUrl } from "./api.js";
import { el, clear } from "./dom.js";
import { capitalize } from "./format.js";

const CATEGORIES = ["type", "lieu", "couleur", "shape"];

function nameCell(name, className, extra) {
  return el("td", { className }, [
    el("img", { className: "entity-thumb", attrs: { src: spriteUrl(name), alt: "", loading: "lazy" } }),
    el("div", { text: capitalize(name) }),
    extra
  ]);
}

function guessRow(guess) {
  const synonym = guess.synonymOf
    ? el("span", { className: "synonym-indicator", text: `Used synonym: ${guess.synonymOf}` })
    : null;
  return el("tr", {}, [
    nameCell(guess.nom, guess.verdict.isCorrect ? "correct" : "wrong", synonym),
    ...CATEGORIES.map((category) =>
      el("td", { className: guess.verdict[category] || "wrong", text: guess.valeurs[category] || "-" })
    )
  ]);
}

function solutionRow(solution) {
  return el("tr", { className: "solution-row" }, [
    nameCell(solution.nom, "correct"),
    ...CATEGORIES.map((category) =>
      el("td", { className: "correct", text: solution.valeurs[category] || "-" })
    )
  ]);
}

// Dernier essai en haut ; la réponse s'ajoute au-dessus après une défaite
export function renderBoard(tbody, state, synonymsUsed = {}) {
  clear(tbody);
  const rows = state.guesses
    .map((guess) => guessRow({ ...guess, synonymOf: synonymsUsed[guess.nom] }))
    .reverse();
  if (state.solution && state.status !== "won") rows.unshift(solutionRow(state.solution));
  tbody.append(...rows);
}
