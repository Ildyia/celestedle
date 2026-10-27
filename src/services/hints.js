const { HttpError } = require("../utils/http-error");
const { CATEGORIES, toList, displayValues } = require("./compare");

const HINT_TYPES = ["opposite", "secret_info", "truth_and_lies", "info"];

// Vocabulaire de chaque catégorie, sous les noms de elementsRepo.vocabulary()
const VOCAB_KEYS = {
  type: "types",
  lieu: "locations",
  couleur: "colors",
  shape: "shapes"
};

// Statements de « 1 Truth & 2 Lies » : forme et couleur d'abord, puis aussi
// type et chapitres s'il ne reste plus rien à dire sur les premières
const STATEMENT_GROUPS = [
  ["shape", "couleur"],
  ["shape", "couleur", "type", "lieu"]
];

// Ce que le joueur sait déjà du mot secret, d'après ses essais et ses indices :
// - present[c] : valeurs qu'il sait dans la réponse
// - absent[c] : valeurs qu'il sait hors de la réponse
// - complete : catégories entièrement trouvées (verdict vert)
function knowledge(guesses, previousHints) {
  const present = Object.fromEntries(CATEGORIES.map((c) => [c, new Set()]));
  const absent = Object.fromEntries(CATEGORIES.map((c) => [c, new Set()]));
  const complete = new Set();

  for (const { element, verdict } of guesses) {
    for (const category of CATEGORIES) {
      const values = toList(element[category]);
      if (verdict[category] === "correct") {
        complete.add(category);
        values.forEach((v) => present[category].add(v));
      } else if (verdict[category] === "partial") {
        // L'essai est contenu dans la réponse : toutes ses valeurs y sont
        values.forEach((v) => present[category].add(v));
      } else if (verdict[category] === "wrong") {
        values.forEach((v) => absent[category].add(v));
      }
    }
  }
  for (const hint of previousHints) {
    if (hint.type === "secret_info" && hint.category)
      present[hint.category].add(hint.value);
  }
  return { present, absent, complete };
}

function pick(list, random, offset) {
  return list.length === 0 ? null : list[random(offset) % list.length];
}

function noOverlap(a, b) {
  const listB = toList(b);
  return !toList(a).some((v) => listB.includes(v));
}

// Élément qui partage le moins de choses avec le mot secret, parmi ceux que
// le joueur n'a pas encore proposés
function opposite({ secret, elements, guesses, random }) {
  const guessed = new Set(guesses.map((g) => g.element.id));
  const scored = elements
    .filter((el) => el.id !== secret.id && !guessed.has(el.id))
    .map((el) => ({
      el,
      different: CATEGORIES.filter((c) => noOverlap(el[c], secret[c]))
    }));
  if (scored.length === 0) return { element: null, categories: [] };

  const max = Math.max(...scored.map((s) => s.different.length));
  const best = scored.filter((s) => s.different.length === max);
  const choice = pick(best, random, 1);
  return { element: choice.el.nom, categories: choice.different };
}

// Une valeur du mot secret que le joueur ne connaît pas encore
function secretInfo({ secret, known, random }) {
  const candidates = CATEGORIES.filter((c) => !known.complete.has(c)).flatMap(
    (category) =>
      toList(secret[category])
        .filter((value) => !known.present[category].has(value))
        .map((value) => ({
          category,
          value,
          partial: toList(secret[category]).length > 1
        }))
  );
  return (
    pick(candidates, random, 2) ?? {
      category: null,
      value: null,
      partial: false
    }
  );
}

// Une vérité inconnue du joueur et deux mensonges qu'il ne peut pas déjà
// éliminer, tirés des vrais vocabulaires de la base
function truthAndLies({ secret, vocabulary, known, random }) {
  const truthsIn = (categories) =>
    categories
      .filter((c) => !known.complete.has(c))
      .flatMap((category) =>
        toList(secret[category])
          .filter((value) => !known.present[category].has(value))
          .map((value) => ({ category, value }))
      );
  const liesIn = (categories) =>
    categories
      .filter((c) => !known.complete.has(c))
      .flatMap((category) => {
        const inSecret = toList(secret[category]);
        return (vocabulary[VOCAB_KEYS[category]] || [])
          .filter(
            (value) =>
              !inSecret.includes(value) && !known.absent[category].has(value)
          )
          .map((value) => ({ category, value }));
      });

  // Premier groupe de catégories qui permet une vérité et deux mensonges
  const usable = STATEMENT_GROUPS.find(
    (cats) => truthsIn(cats).length > 0 && liesIn(cats).length >= 2
  );
  if (!usable) return { statements: [] };

  const truth = pick(truthsIn(usable), random, 3);
  const lies = liesIn(usable);
  // Deux mensonges de catégories différentes si possible
  const firstLie = pick(lies, random, 11);
  const others = lies.filter((l) => l !== firstLie);
  const otherCategory = others.filter((l) => l.category !== firstLie.category);
  const secondLie = pick(
    otherCategory.length > 0 ? otherCategory : others,
    random,
    13
  );

  const statements = [truth, firstLie, secondLie];
  const order = random(6) % 3;
  if (order === 1) statements.push(statements.shift());
  if (order === 2) statements.unshift(statements.pop());
  return { statements };
}

// L'élément choisi par le joueur et ses valeurs. Les valeurs sont rangées
// sous `values` : une clé `type` écraserait le type de l'indice à la lecture
function info({ elements, choice }) {
  const name = String(choice ?? "").trim().toLowerCase();
  if (!name) throw new HttpError(400, "Pick an element first.");
  const element = elements.find((e) => e.nom.toLowerCase() === name);
  if (!element) throw new HttpError(400, `Unknown element "${choice}"`);
  return { element: element.nom, values: displayValues(element) };
}

const BUILDERS = {
  opposite,
  secret_info: secretInfo,
  truth_and_lies: truthAndLies,
  info
};

// Construit le contenu d'un indice. Le texte est mis en forme par le client.
// context : { secret, elements, guesses: [{ element, verdict }],
//             previousHints, vocabulary, random(offset) }
function buildHint(type, context) {
  const builder = BUILDERS[type];
  if (!builder) throw new HttpError(400, `Unknown hint type "${type}"`);
  const known = knowledge(context.guesses ?? [], context.previousHints ?? []);
  return builder({ ...context, guesses: context.guesses ?? [], known });
}

module.exports = { HINT_TYPES, buildHint, knowledge };
