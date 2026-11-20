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

// Mélange pondéré (Efraimidis-Spirakis) : un poids fort passe plus souvent
// en tête, sans jamais exclure un poids faible
function weightedShuffle(list, weight, random) {
  return list
    .map((item) => ({ item, key: -Math.log(1 - random()) / Math.max(weight(item), 1e-6) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
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

// Catégories d'abord, éléments ensuite : une fois les 4 catégories du jour
// choisies, on cherche vraiment des éléments qui marchent (ELEMENT_SAMPLES
// tirages), et on garde jusqu'à `keep` combinaisons valides différentes. Avant,
// 10 tirages ratés faisaient changer de catégories : les catégories « faciles
// à remplir » gagnaient toujours, avec leurs mêmes éléments.
const ELEMENT_SAMPLES = 150;

// stats compte les raisons d'échec, pour expliquer une génération impossible
function tryGroups(chosen, categories, random, rule, stats, weigh, keep = 1, samples = SAMPLES_PER_CHOICE) {
  const found = [];
  const seen = new Set();
  for (let sample = 0; sample < samples && found.length < keep; sample++) {
    const result = sampleGroups(chosen, categories, random, rule, stats, weigh);
    // null : ces catégories ne peuvent pas marcher du tout
    if (result === null) break;
    if (result === undefined) continue;
    const key = [...result.tiles].sort((a, b) => a - b).join();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(result);
  }
  return found;
}

// null : ces catégories ne peuvent pas marcher ; undefined : réessayer d'autres cases
// weigh.element(id) : poids d'un élément à la pioche (voir tryGenerate)
function sampleGroups(chosen, categories, random, rule, stats, weigh) {
  const tiles = [];
  const groups = [];
  // Types et tags à surveiller pendant la pioche (voir hasObviousDecoy)
  const guards =
    rule === "none" ? [] : categories.filter((c) => !chosen.includes(c) && OBVIOUS_DECOY_KINDS.includes(c.kind) && c.usable);
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
    // Pioche case par case : on saute une case qui ferait 4 cases d'un même
    // type ou tag hors des groupes, plutôt que de jeter toute la grille à la
    // vérification. Bien plus de grilles strictes, et plus vite.
    const members = [];
    for (const id of weightedShuffle(pool, weigh.element, random)) {
      if (members.length === GROUP_SIZE) break;
      const placed = [...tiles, ...members];
      const makesDecoy = guards.some(
        (c) => c.members.has(id) && placed.filter((x) => c.members.has(x)).length >= GROUP_SIZE - 1
      );
      if (!makesDecoy) members.push(id);
    }
    if (members.length < GROUP_SIZE) {
      stats.decoy++;
      return undefined;
    }
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
// Un groupe tag est imposé quand un tag complet le permet ; maxTags limite
// leur nombre (1 en normal : un tag ne se devine pas sans le connaître).
// Mode normal : pas de faux groupe ; si aucune grille stricte n'est trouvée
// (rare), on accepte un « faux groupe parfait » plutôt que de ne pas avoir de
// grille. Mode Hard (allowDecoys) : faux groupes permis, seule l'unicité de
// la solution compte.
// En dernier recours, le mode normal accepte aussi une grille à faux groupes
// (rule "none") : mieux vaut une grille imparfaite que pas de grille. La règle
// utilisée est renvoyée (rule) pour que l'admin le voie.
//
// Variété (recent) : { elements: Map<id, poids>, categories: Map<clé, poids> },
// ce qui est sorti les jours précédents (poids plus fort si plus récent).
// Sans ça, les grilles se répétaient : le générateur garde facilement les
// éléments qui ne rentrent que dans peu de catégories (Oshiro, Badeline
// chaser) et écarte presque toujours ceux « à tout faire » (Tiles, Spikes).
// D'où ces corrections (mesurées sur 80 à 120 jours simulés) :
// - les 4 catégories du jour d'abord, en rotation : une catégorie sortie
//   récemment passe son tour (la plus tirée : 32 fois → 17 sur 80 jours) ;
// - puis une vraie recherche d'éléments pour ces catégories (voir
//   ELEMENT_SAMPLES), qui évite les éléments récents et favorise ceux « à
//   tout faire » ; on garde la moins répétitive de CANDIDATES combinaisons ;
// - on ne change de catégories que si elles sont impossibles à remplir.
// Les petites catégories (personnages, forme « humanoid ») n'ont que 6 à 8
// membres : leurs membres reviennent avec elles, c'est inévitable.
const CANDIDATES = 6;

const TAG_CHANCE = 0.5;
// Rotation des catégories : poids 1 / (1 + 3 × récence)^CAT_POW
const CAT_POW = 3;

// maxPerKind : nombre de groupes au plus par sorte (chapter, colour…), en plus
// de MAX_SAME_KIND (ex. { chapter: 1 } : un seul groupe « Found in … »)
function generatePuzzle(
  elements,
  tags,
  random = Math.random,
  { allowDecoys = false, maxTags = MAX_SAME_KIND, recent = null, maxPerKind = {} } = {}
) {
  const rules = allowDecoys ? ["none"] : ["strict", "relaxed", "none"];
  const stats = { incompatible: 0, decoy: 0, multiple: 0 };
  for (const rule of rules) {
    const puzzle = tryGenerate(elements, tags, random, rule, stats, { maxTags, maxPerKind }, recent);
    if (puzzle) return { ...puzzle, rule };
  }
  throw noPuzzleError(elements, tags, stats);
}

// Répétition d'une grille par rapport aux jours précédents : plus c'est
// bas, plus elle est neuve
function repetitionScore(found, recent) {
  if (!recent) return 0;
  const element = (id) => recent.elements?.get(id) ?? 0;
  const category = (key) => recent.categories?.get(key) ?? 0;
  return found.tiles.reduce((s, id) => s + element(id), 0) + 4 * found.groups.reduce((s, g) => s + category(g.category.key), 0);
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

function tryGenerate(elements, tags, random, rule, stats, { maxTags, maxPerKind }, recent) {
  // Un tag qui ne peut pas servir de groupe (hors limites ou incomplet) ne
  // compte pas non plus dans la vérification : un tag qui couvre presque tout
  // le catalogue rendait toutes les combinaisons de 4 cases valides, et plus
  // aucune grille n'avait une seule solution
  const categories = buildCategories(elements, tags).filter((c) => c.kind !== "tag" || c.usable);
  const usable = categories.filter((c) => c.usable);
  const usableTags = usable.filter((c) => c.kind === "tag");

  // Poids : une catégorie ou un élément sortis récemment pèsent moins ; un
  // élément pèse d'autant plus qu'il appartient à de catégories (sinon les
  // éléments « à tout faire » ne sortent presque jamais)
  const breadth = new Map(elements.map((e) => [e.id, categories.filter((c) => c.members.has(e.id)).length]));
  const weigh = {
    // Rotation : une catégorie sortie récemment passe son tour
    category: (c) => 1 / (1 + 3 * (recent?.categories?.get(c.key) ?? 0)) ** CAT_POW,
    element: (id) => (breadth.get(id) ?? 1) / (1 + 4 * (recent?.elements?.get(id) ?? 0)) ** 2
  };

  // Un groupe tag n'est imposé qu'une grille sur TAG_CHANCE environ :
  // imposé chaque jour, les quelques tags complets revenaient sans cesse.
  // Les autres jours, un tag peut sortir comme n'importe quelle catégorie.
  const imposeTag = usableTags.length > 0 && random() < TAG_CHANCE;
  const candidates = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS && candidates.length < CANDIDATES; attempt++) {
    // La moitié des essais sans tag imposé, si aucun tirage avec tag n'aboutit
    const withTag = imposeTag && attempt < MAX_ATTEMPTS / 2;
    const first = withTag ? weightedShuffle(usableTags, weigh.category, random).slice(0, 1) : [];
    // Au plus 2 groupes de la même sorte, pour varier (pas 3 groupes couleur)
    const chosen = [...first];
    for (const category of weightedShuffle(usable.filter((c) => !first.includes(c)), weigh.category, random)) {
      if (chosen.length === GROUP_COUNT) break;
      const limit = category.kind === "tag" ? maxTags : (maxPerKind[category.kind] ?? MAX_SAME_KIND);
      if (chosen.filter((c) => c.kind === category.kind).length < limit) chosen.push(category);
    }
    if (chosen.length < GROUP_COUNT) break;

    // Sans historique, la première grille valide suffit
    candidates.push(...tryGroups(chosen, categories, random, rule, stats, weigh, recent ? CANDIDATES : 1, ELEMENT_SAMPLES));
    // Catégories du jour trouvées : on s'y tient
    if (candidates.length) break;
  }
  if (!candidates.length) return null;

  const best = candidates.reduce((a, b) => (repetitionScore(b, recent) < repetitionScore(a, recent) ? b : a));
  const groups = shuffle(best.groups, random).map((g, level) => ({
    key: g.category.key,
    kind: g.category.kind,
    label: g.category.label,
    level,
    elementIds: g.elementIds
  }));
  return { groups, tiles: shuffle(best.tiles, random) };
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
