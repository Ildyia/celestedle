// Logique pure de comparaison entre un essai et le mot secret

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

function verdictFor(guess, secret) {
  const verdict = { isCorrect: guess.id === secret.id };
  for (const category of CATEGORIES) {
    verdict[category] = compareValues(guess[category], secret[category]);
  }
  return verdict;
}

function displayValues(element) {
  return Object.fromEntries(
    CATEGORIES.map((category) => [category, toList(element[category]).join(", ")])
  );
}

// Catégories déjà trouvées (vertes) dans une liste d'essais
function foundCategories(verdicts) {
  return CATEGORIES.filter((category) => verdicts.some((v) => v[category] === "correct"));
}

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  toList,
  compareValues,
  verdictFor,
  displayValues,
  foundCategories
};
