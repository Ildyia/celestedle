import { el, clear } from "./dom.js";
import { capitalize } from "./format.js";
import { CELESTEDLE } from "./catalogs.js";

// Catégorie ordonnée (difficulté des techs) : la réponse est au-dessus ou en dessous
const ARROWS = { higher: " ⬆️", lower: " ⬇️" };

function nameCell(catalog, name, className, extra) {
  return el("td", { className }, [
    el("img", { className: "entity-thumb", attrs: { src: catalog.imageUrl(name), alt: "", loading: "lazy" } }),
    el("div", { text: capitalize(name) }),
    extra
  ]);
}

function valueCell(guess, category) {
  const verdict = guess.verdict[category] || "wrong";
  const arrow = ARROWS[verdict];
  return el("td", {
    className: arrow ? `wrong ${verdict}` : verdict,
    text: `${guess.valeurs[category] || "-"}${arrow ?? ""}`,
    attrs: arrow ? { title: verdict === "higher" ? "The answer is harder" : "The answer is easier" } : {}
  });
}

function guessRow(catalog, guess) {
  const synonym = guess.synonymOf
    ? el("span", { className: "synonym-indicator", text: `Used synonym: ${guess.synonymOf}` })
    : null;
  return el("tr", {}, [
    nameCell(catalog, guess.nom, guess.verdict.isCorrect ? "correct" : "wrong", synonym),
    ...catalog.categories.map((category) => valueCell(guess, category))
  ]);
}

function solutionRow(catalog, solution) {
  return el("tr", { className: "solution-row" }, [
    nameCell(catalog, solution.nom, "correct"),
    ...catalog.categories.map((category) =>
      el("td", { className: "correct", text: solution.valeurs[category] || "-" })
    )
  ]);
}

// Dernier essai en haut ; la réponse s'ajoute au-dessus après une défaite
export function renderBoard(tbody, state, synonymsUsed = {}, catalog = CELESTEDLE) {
  clear(tbody);
  const rows = state.guesses
    .map((guess) => guessRow(catalog, { ...guess, synonymOf: synonymsUsed[guess.nom] }))
    .reverse();
  if (state.solution && state.status !== "won") rows.unshift(solutionRow(catalog, state.solution));
  tbody.append(...rows);
}
