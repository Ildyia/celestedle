// Génération des grilles Connections : 4 groupes de 4 éléments qui partagent
// une catégorie (attribut ou tag), avec une seule façon de ranger les 16.

const GROUP_SIZE = 4;
const GROUP_COUNT = 4;
const MAX_ATTEMPTS = 5000;
const MAX_SAME_KIND = 2;

// Faux groupes refusés : 4 cases ou plus d'un même type (ou tag) hors des
// groupes, et pour toute catégorie exactement 4 cases hors des groupes (un
// « faux groupe parfait », impossible à distinguer d'un vrai). 5 cases ou plus
// d'une même couleur ou d'un même chapitre restent des fausses pistes
// permises : le joueur voit qu'il faut en écarter.
const OBVIOUS_DECOY_KINDS = ["type", "tag"];

// Au-delà, une catégorie chevauche presque toutes les autres et la grille
// n'a jamais une seule solution (Farewell : 55 éléments sur 99)
const MAX_CATEGORY_SIZE = 40;

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Catégories : { key, kind, label, members: Set<id> }. usable = peut servir de
// groupe ; les autres (tags incomplets) comptent seulement dans la
// vérification d'unicité.
function buildCategories(elements, tags = []) {
  const map = new Map();
  const add = (key, kind, label, id) => {
    if (!map.has(key)) map.set(key, { key, kind, label, members: new Set(), usable: true });
    map.get(key).members.add(id);
  };
  for (const e of elements) {
    add(`type:${e.type}`, "type", capitalize(e.type), e.id);
    add(`shape:${e.shape}`, "shape", capitalize(e.shape), e.id);
    for (const c of e.couleur) add(`colour:${c}`, "colour", capitalize(c), e.id);
    for (const l of e.lieu) add(`chapter:${l}`, "chapter", `Found in ${capitalize(l)}`, e.id);
  }
  const activeIds = new Set(elements.map((e) => e.id));
  for (const tag of tags) {
    const members = tag.elementIds.filter((id) => activeIds.has(id));
    map.set(`tag:${tag.id}`, {
      key: `tag:${tag.id}`,
      kind: "tag",
      label: tag.label,
      members: new Set(members),
      usable: tag.unreviewedIds.length === 0
    });
  }
  for (const category of map.values()) {
    const size = category.members.size;
    if (size < GROUP_SIZE || size > MAX_CATEGORY_SIZE) category.usable = false;
  }
  return [...map.values()];
}

// Générateur pseudo-aléatoire reproductible (mulberry32)
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Nombre de façons de ranger les 16 éléments en groupes de 4 qui partagent
// chacun au moins une catégorie (on s'arrête à 2 : seul « 1 » compte)
function countSolutions(tileIds, categories) {
  const memberships = tileIds.map((id) => categories.filter((c) => c.members.has(id)));
  const shareCategory = (indexes) =>
    memberships[indexes[0]].some((c) => indexes.every((i) => c.members.has(tileIds[i])));
  const used = new Array(tileIds.length).fill(false);
  let count = 0;

  function place() {
    const first = used.indexOf(false);
    if (first === -1) {
      count++;
      return;
    }
    used[first] = true;
    for (let a = first + 1; a < used.length && count < 2; a++) {
      if (used[a]) continue;
      for (let b = a + 1; b < used.length && count < 2; b++) {
        if (used[b]) continue;
        for (let c = b + 1; c < used.length && count < 2; c++) {
          if (used[c] || !shareCategory([first, a, b, c])) continue;
          used[a] = used[b] = used[c] = true;
          place();
          used[a] = used[b] = used[c] = false;
        }
      }
    }
    used[first] = false;
  }

  place();
  return count;
}

// Pour 4 catégories, plusieurs tirages de cases : changer les cases suffit
// souvent à faire disparaître un faux groupe
const SAMPLES_PER_CHOICE = 10;

// stats compte les raisons d'échec, pour expliquer une génération impossible
function tryGroups(chosen, categories, random, rule, stats) {
  for (let sample = 0; sample < SAMPLES_PER_CHOICE; sample++) {
    const found = sampleGroups(chosen, categories, random, rule, stats);
    if (found !== undefined) return found;
  }
  return null;
}

// null : ces catégories ne peuvent pas marcher ; undefined : réessayer d'autres cases
function sampleGroups(chosen, categories, random, rule, stats) {
  const tiles = [];
  const groups = [];
  for (const category of chosen) {
    const others = chosen.filter((c) => c !== category);
    // Chaque élément ne va que dans un seul des 4 groupes choisis
    const pool = [...category.members].filter(
      (id) => !tiles.includes(id) && !others.some((o) => o.members.has(id))
    );
    if (pool.length < GROUP_SIZE) {
      stats.incompatible++;
      return null;
    }
    const members = shuffle(pool, random).slice(0, GROUP_SIZE);
    tiles.push(...members);
    groups.push({ category, elementIds: members });
  }
  if (hasObviousDecoy(tiles, chosen, categories, rule)) {
    stats.decoy++;
    return undefined;
  }
  if (countSolutions(tiles, categories) !== 1) {
    stats.multiple++;
    return undefined;
  }
  return { groups, tiles };
}

// tiles : les 16 cases rangées groupe par groupe (4 par 4, dans l'ordre de chosen)
// rule : "strict" (mode normal), "relaxed" (repli du mode normal : type et
// tag seulement) ou "none" (mode Hard : faux groupes permis)
function hasObviousDecoy(tiles, chosen, categories, rule = "strict") {
  if (rule === "none") return false;
  const groupKeys = chosen.map((_, i) => [...tiles.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE)].sort().join());
  return categories.some((c) => {
    if (chosen.includes(c)) return false;
    const inside = tiles.filter((id) => c.members.has(id));
    // Type ou tag : visibles d'un coup d'œil, aucun faux groupe accepté
    if (OBVIOUS_DECOY_KINDS.includes(c.kind) && c.usable && inside.length >= GROUP_SIZE) return true;
    // Toute catégorie : exactement 4 cases qui ne sont pas un des groupes
    // ressemblent en tout point à un vrai groupe
    return rule === "strict" && inside.length === GROUP_SIZE && !groupKeys.includes([...inside].sort().join());
  });
}

// Grille { groups: [{ key, kind, label, level, elementIds }], tiles: [16 ids] }.
// level (0 à 3) donne seulement la couleur du groupe, tirée au hasard : elle
// ne dit rien de sa difficulté.
// Un groupe tag est imposé quand un tag complet le permet.
// Mode normal : pas de faux groupe ; si aucune grille stricte n'est trouvée
// (rare), on accepte un « faux groupe parfait » plutôt que de ne pas avoir de
// grille. Mode Hard (allowDecoys) : faux groupes permis, seule l'unicité de
// la solution compte.
// En dernier recours, le mode normal accepte aussi une grille à faux groupes
// (rule "none") : mieux vaut une grille imparfaite que pas de grille. La règle
// utilisée est renvoyée (rule) pour que l'admin le voie.
function generatePuzzle(elements, tags, random = Math.random, { allowDecoys = false } = {}) {
  const rules = allowDecoys ? ["none"] : ["strict", "relaxed", "none"];
  const stats = { incompatible: 0, decoy: 0, multiple: 0 };
  for (const rule of rules) {
    const puzzle = tryGenerate(elements, tags, random, rule, stats);
    if (puzzle) return { ...puzzle, rule };
  }
  throw noPuzzleError(elements, tags, stats);
}

// Message détaillé : l'équipe admin le voit dans l'onglet Connections
function noPuzzleError(elements, tags, stats) {
  const usable = buildCategories(elements, tags).filter((c) => c.usable);
  const byKind = {};
  for (const c of usable) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  const kinds = Object.entries(byKind).map(([kind, n]) => `${n} ${kind}`).join(", ");
  return new Error(
    `No Connections puzzle with a single solution could be generated ` +
      `(${elements.length} active elements; usable groups: ${kinds || "none"}; ${tags.length} tag(s); ` +
      `failed draws: ${stats.incompatible} incompatible groups, ${stats.decoy} decoy groups, ${stats.multiple} several solutions).`
  );
}

function tryGenerate(elements, tags, random, rule, stats) {
  // Un tag qui ne peut pas servir de groupe (hors limites ou incomplet) ne
  // compte pas non plus dans la vérification : un tag qui couvre presque tout
  // le catalogue rendait toutes les combinaisons de 4 cases valides, et plus
  // aucune grille n'avait une seule solution
  const categories = buildCategories(elements, tags).filter((c) => c.kind !== "tag" || c.usable);
  const usable = categories.filter((c) => c.usable);
  const usableTags = usable.filter((c) => c.kind === "tag");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // La moitié des essais sans tag imposé, si aucun tirage avec tag n'aboutit
    const withTag = usableTags.length > 0 && attempt < MAX_ATTEMPTS / 2;
    const first = withTag ? [usableTags[Math.floor(random() * usableTags.length)]] : [];
    // Au plus 2 groupes de la même sorte, pour varier (pas 3 groupes couleur)
    const chosen = [...first];
    for (const category of shuffle(usable.filter((c) => !first.includes(c)), random)) {
      if (chosen.length === GROUP_COUNT) break;
      if (chosen.filter((c) => c.kind === category.kind).length < MAX_SAME_KIND) chosen.push(category);
    }
    if (chosen.length < GROUP_COUNT) break;

    const found = tryGroups(chosen, categories, random, rule, stats);
    if (!found) continue;

    const groups = shuffle(found.groups, random).map((g, level) => ({
      key: g.category.key,
      kind: g.category.kind,
      label: g.category.label,
      level,
      elementIds: g.elementIds
    }));
    return { groups, tiles: shuffle(found.tiles, random) };
  }
  return null;
}

module.exports = {
  GROUP_SIZE,
  hasObviousDecoy,
  GROUP_COUNT,
  buildCategories,
  countSolutions,
  generatePuzzle,
  seededRandom
};
