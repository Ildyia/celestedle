const { HttpError } = require("../utils/http-error");
const { CATEGORIES, toList, foundCategories } = require("./compare");

const HINT_TYPES = ["opposite", "secret_info", "truth_and_lies"];

function noOverlap(a, b) {
  const listB = toList(b);
  return !toList(a).some((v) => listB.includes(v));
}

// Élément qui partage le moins de choses avec le mot secret
function opposite({ secret, elements, random }) {
  const scored = elements
    .filter((el) => el.id !== secret.id)
    .map((el) => ({
      el,
      different: CATEGORIES.filter((c) => noOverlap(el[c], secret[c]))
    }));
  if (scored.length === 0) return { element: null, categories: [] };

  const max = Math.max(...scored.map((s) => s.different.length));
  const best = scored.filter((s) => s.different.length === max);
  const pick = best[random(1) % best.length];
  return { element: pick.el.nom, categories: pick.different };
}

// Une valeur du mot secret, dans une catégorie que le joueur n'a pas encore
// trouvée (B20)
function secretInfo({ secret, verdicts, random }) {
  const found = foundCategories(verdicts);
  const remaining = CATEGORIES.filter((c) => !found.includes(c));
  const pool = remaining.length > 0 ? remaining : CATEGORIES;
  const category = pool[random(2) % pool.length];
  const values = toList(secret[category]);
  return { category, value: values[0], partial: values.length > 1 };
}

// Une vérité (forme ou couleur) et deux mensonges tirés des vocabulaires réels
// de la base (B08)
function truthAndLies({ secret, vocabulary, random }) {
  const secretColors = toList(secret.couleur);
  const pickFrom = (pool, offset) =>
    pool.length === 0 ? null : pool[random(offset) % pool.length];

  const truths = [
    { category: "shape", value: toList(secret.shape)[0] },
    { category: "couleur", value: secretColors[0] }
  ];
  const truth = truths[random(3) % truths.length];

  const lies = [
    { category: "shape", value: pickFrom(vocabulary.shapes.filter((s) => s !== toList(secret.shape)[0]), 11) },
    { category: "couleur", value: pickFrom(vocabulary.colors.filter((c) => !secretColors.includes(c)), 13) }
  ].filter((lie) => lie.value);

  const statements = [truth, ...lies];
  const order = random(6) % 3;
  if (order === 1) statements.push(statements.shift());
  if (order === 2) statements.unshift(statements.pop());
  return { statements };
}

const BUILDERS = { opposite, secret_info: secretInfo, truth_and_lies: truthAndLies };

// Construit le contenu d'un indice. Le texte est mis en forme par le client.
function buildHint(type, context) {
  const builder = BUILDERS[type];
  if (!builder) throw new HttpError(400, `Unknown hint type "${type}"`);
  return builder(context);
}

module.exports = { HINT_TYPES, buildHint };
