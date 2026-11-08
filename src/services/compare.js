// Logique pure de comparaison entre un essai et le mot secret. Un catalogue
// (éléments de Celestedle, techs) donne ses catégories ; une catégorie
// « ordonnée » (difficulté des techs) dit en plus si la réponse est au-dessus
// ou en dessous.

const CATEGORIES = ["type", "lieu", "couleur", "shape"];

const CATEGORY_LABELS = {
  type: "Type",
  lieu: "Chapter",
  couleur: "Colour",
  shape: "Shape"
};

function toList(value) {
  return (Array.isArray(value) ? value : [value])
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => String(v).trim().toLowerCase());
}

// correct : mêmes valeurs
// partial : l'essai est contenu dans la réponse
// notTotallyWrong : valeurs en commun, plus des valeurs en trop
// wrong : aucune valeur en commun
function compareValues(guessValue, secretValue) {
  const guess = toList(guessValue);
  const secret = toList(secretValue);

  const exact = guess.length === secret.length && guess.every((v) => secret.includes(v));
  if (exact) return "correct";

  const hasCommon = guess.some((v) => secret.includes(v));
  if (!hasCommon) return "wrong";

  return guess.some((v) => !secret.includes(v)) ? "notTotallyWrong" : "partial";
}

// Catégorie ordonnée : correct, ou higher / lower (la réponse est plus haut
// ou plus bas dans l'ordre), wrong pour une valeur hors de l'ordre
function compareOrdered(order, guessValue, secretValue) {
  const guess = order.indexOf(toList(guessValue)[0]);
  const secret = order.indexOf(toList(secretValue)[0]);
  if (guess === -1 || secret === -1) return compareValues(guessValue, secretValue);
  if (guess === secret) return "correct";
  return secret > guess ? "higher" : "lower";
}

// Comparateur d'un catalogue. ordered : { catégorie: [valeurs dans l'ordre] }
// display(item, catégorie) : texte affiché (par défaut, valeurs en minuscules)
function createComparator({ categories, labels, ordered = {}, display }) {
  const compareCategory = (category, guessValue, secretValue) =>
    ordered[category]
      ? compareOrdered(ordered[category], guessValue, secretValue)
      : compareValues(guessValue, secretValue);

  return {
    categories,
    labels,
    ordered,
    compareCategory,
    verdictFor(guess, secret) {
      const verdict = { isCorrect: guess.id === secret.id };
      for (const category of categories) {
        verdict[category] = compareCategory(category, guess[category], secret[category]);
      }
      return verdict;
    },
    displayValues(item) {
      return Object.fromEntries(
        categories.map((category) => [
          category,
          display ? display(item, category) : toList(item[category]).join(", ")
        ])
      );
    },
    // Catégories déjà trouvées (vertes) dans une liste d'essais
    foundCategories(verdicts) {
      return categories.filter((category) => verdicts.some((v) => v[category] === "correct"));
    }
  };
}

const elementsComparator = createComparator({ categories: CATEGORIES, labels: CATEGORY_LABELS });

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  toList,
  compareValues,
  compareOrdered,
  createComparator,
  elementsComparator,
  verdictFor: elementsComparator.verdictFor,
  displayValues: elementsComparator.displayValues,
  foundCategories: elementsComparator.foundCategories
};
