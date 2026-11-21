// Génération des grilles Connections : 4 groupes de 4 éléments qui partagent
// une catégorie (attribut ou tag), avec une seule façon de ranger les 16.

const GROUP_SIZE = 4;
const GROUP_COUNT = 4;
const MAX_ATTEMPTS = 5000;
const MAX_SAME_KIND = 2;

// Faux groupe refusé (A-Side) : exactement 4 cases qui partagent une
// catégorie sans être un des groupes, un « faux groupe parfait » impossible à
// distinguer d'un vrai. 5 cases ou plus d'une même catégorie (type, tag,
// couleur…) restent des fausses pistes permises : le joueur voit qu'il faut
// en écarter. En repli (règle « relaxed »), seuls les types et les tags,
// visibles d'un coup d'œil, sont surveillés.
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
// … mais seulement pour les premiers jeux de catégories : quand ils sont
// impossibles à remplir (certains tags), les essais suivants reprennent
// SAMPLES_PER_CHOICE tirages. Sans cette borne, un jour difficile coûtait
// 15 fois plus que l'ancien générateur (le calcul tourne maintenant dans un
// worker, mais une grille doit quand même sortir en quelques secondes).
const FULL_SEARCH_ATTEMPTS = 20;
// Et au plus FULL_SEARCH_MS de recherche complète par règle : au-delà, on
// repasse aussi à SAMPLES_PER_CHOICE (une grille lente à trouver n'est pas
// meilleure). La grille est enregistrée une fois tirée : que ce cas dépende
// de la vitesse de la machine ne change rien pour les joueurs.
const FULL_SEARCH_MS = 1000;

// stats compte les raisons d'échec, pour expliquer une génération impossible.
// stats.blame (facultatif, diagnostic des tags) : par clé de catégorie,
// { decoy, incompatible } = nombre de tirages qu'elle a fait rejeter
function blame(stats, category, reason) {
  if (!stats.blame || !category) return;
  const entry = stats.blame.get(category.key) ?? { decoy: 0, incompatible: 0 };
  entry[reason]++;
  stats.blame.set(category.key, entry);
}

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

// Échanges tentés pour défaire les faux groupes d'un tirage
const MAX_REPAIRS = 8;

// null : ces catégories ne peuvent pas marcher ; undefined : réessayer d'autres cases
// weigh.element(id) : poids d'un élément à la pioche (voir tryGenerate)
function sampleGroups(chosen, categories, random, rule, stats, weigh) {
  const tiles = [];
  const groups = [];
  const spares = []; // par groupe : les membres pas tirés, pour les échanges
  for (const category of chosen) {
    const others = chosen.filter((c) => c !== category);
    // Chaque élément ne va que dans un seul des 4 groupes choisis
    const pool = [...category.members].filter(
      (id) => !tiles.includes(id) && !others.some((o) => o.members.has(id)) && !weigh.resting?.(id)
    );
    if (pool.length < GROUP_SIZE) {
      stats.incompatible++;
      blame(stats, category, "incompatible");
      return null;
    }
    const shuffled = weightedShuffle(pool, weigh.element, random);
    const members = shuffled.slice(0, GROUP_SIZE);
    spares.push(shuffled.slice(GROUP_SIZE));
    tiles.push(...members);
    groups.push({ category, elementIds: members });
  }
  // Faux groupe : on échange une de ses 4 cases contre un autre membre de son
  // groupe (qui n'a pas ce point commun), puis on revérifie. Bien plus de
  // grilles strictes qu'en jetant tout le tirage.
  for (let repair = 0; ; repair++) {
    const decoy = findDecoy(tiles, chosen, categories, rule);
    if (!decoy) break;
    const swaps = [];
    tiles.forEach((id, index) => {
      if (!decoy.members.has(id)) return;
      const group = Math.floor(index / GROUP_SIZE);
      const spare = spares[group].find((s) => !decoy.members.has(s));
      if (spare !== undefined) swaps.push({ index, group, spare });
    });
    if (repair === MAX_REPAIRS || !swaps.length) {
      stats.decoy++;
      blame(stats, decoy, "decoy");
      return undefined;
    }
    const { index, group, spare } = swaps[Math.floor(random() * swaps.length)];
    spares[group] = spares[group].filter((s) => s !== spare).concat(tiles[index]);
    tiles[index] = spare;
    groups[group].elementIds = tiles.slice(group * GROUP_SIZE, (group + 1) * GROUP_SIZE);
  }
  if (countSolutions(tiles, categories) !== 1) {
    stats.multiple++;
    return undefined;
  }
  return { groups, tiles };
}

// tiles : les 16 cases rangées groupe par groupe (4 par 4, dans l'ordre de chosen)
// rule : "strict" (mode normal : aucun faux groupe parfait), "relaxed" (repli
// du mode normal : types et tags seulement) ou "none" (mode Hard : faux
// groupes permis)
function hasObviousDecoy(tiles, chosen, categories, rule = "strict") {
  return Boolean(findDecoy(tiles, chosen, categories, rule));
}

// La catégorie qui fait un faux groupe (la première trouvée), ou null
function findDecoy(tiles, chosen, categories, rule = "strict") {
  if (rule === "none") return null;
  const groupKeys = chosen.map((_, i) => [...tiles.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE)].sort().join());
  return (
    categories.find((c) => {
      if (chosen.includes(c)) return false;
      if (rule === "relaxed" && !OBVIOUS_DECOY_KINDS.includes(c.kind)) return false;
      // Exactement 4 cases qui ne sont pas un des groupes : elles ressemblent
      // en tout point à un vrai groupe
      const inside = tiles.filter((id) => c.members.has(id));
      return inside.length === GROUP_SIZE && !groupKeys.includes([...inside].sort().join());
    }) ?? null
  );
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
// Variété (recent) : ce qui est sorti les 30 jours précédents :
// { elements: Map<id, poids>, categories: Map<clé, poids> } (poids plus fort
// si plus récent) et counts: Map<id, nombre de sorties>.
// Priorités, dans l'ordre : une grille sans faux groupe, puis pas d'élément
// trop répété, puis pas de catégorie reprise. D'où (voir tryGenerate) :
// - un élément sorti plus de OVERUSE_CAP fois la moyenne (+ 1) n'est pas
//   pioché ; en dessous, il a d'autant moins de chances qu'il est sorti ;
// - les catégories sont tirées en rotation (une catégorie sortie récemment,
//   ou dont les membres ont trop servi, passe son tour) ; celles de la
//   veille sont écartées d'abord ;
// - on garde la moins répétitive de CANDIDATES grilles valides.
// Les petites catégories (personnages, forme « humanoid ») n'ont que 6 à 8
// membres : leurs membres ne peuvent pas sortir moins souvent qu'elles.
const CANDIDATES = 6;

// Rotation des catégories : poids 1 / (1 + 3 × récence)^CAT_POW
const CAT_POW = 3;
// Un élément sorti plus de OVERUSE_CAP fois la moyenne (+ 1) sur les 30
// derniers jours n'a plus aucune chance (voir tryGenerate)
const OVERUSE_CAP = 1.5;
// Catégorie qui n'a pas 4 membres disponibles : poids × SHORT_CATEGORY
const SHORT_CATEGORY = 0.01;
// Essais (jeux de catégories) des recherches avec restrictions
const PHASE_ATTEMPTS = 1500;
// … et au plus PHASE_MS chacune : une nouvelle grille demandée depuis l'admin
// doit sortir en quelques secondes
const PHASE_MS = 3000;

// maxPerKind : nombre de groupes au plus par sorte (chapter, colour…), en plus
// de MAX_SAME_KIND (ex. { chapter: 1 } : un seul groupe « Found in … »)
// stats : pour le diagnostic des tags (voir diagnoseTags)
function generatePuzzle(
  elements,
  tags,
  random = Math.random,
  { allowDecoys = false, maxTags = MAX_SAME_KIND, maxPerKind = {}, recent = null, stats = { incompatible: 0, decoy: 0, multiple: 0 } } = {}
) {
  const rules = allowDecoys ? ["none"] : ["strict", "relaxed", "none"];
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

// Un groupe tag n'est imposé qu'une grille sur deux environ : imposé chaque
// jour, les quelques tags complets revenaient sans cesse. Les autres jours,
// un tag peut sortir comme n'importe quelle catégorie.
const TAG_CHANCE = 0.5;

function tryGenerate(elements, tags, random, rule, stats, { maxTags, maxPerKind }, recent) {
  // Un tag qui ne peut pas servir de groupe (hors limites ou incomplet) ne
  // compte pas non plus dans la vérification : un tag qui couvre presque tout
  // le catalogue rendait toutes les combinaisons de 4 cases valides, et plus
  // aucune grille n'avait une seule solution
  const categories = buildCategories(elements, tags).filter((c) => c.kind !== "tag" || c.usable);
  const usable = categories.filter((c) => c.usable);
  const usableTags = usable.filter((c) => c.kind === "tag");

  // Poids d'un élément : selon le nombre de fois qu'il est sorti ces derniers
  // jours (recent.counts) par rapport à la moyenne. Plus il sort plus que les
  // autres, moins il a de chances ; à OVERUSE_CAP fois la moyenne (+ 1), il
  // n'en a plus aucune (sauf en dernier recours, voir plus bas)
  const picks = (id) => recent?.counts?.get(id) ?? 0;
  const meanPicks = elements.reduce((sum, e) => sum + picks(e.id), 0) / Math.max(elements.length, 1);
  const cap = OVERUSE_CAP * meanPicks + 1;
  const element = (id) => Math.max(0, 1 - picks(id) / cap) ** 2;
  // Fraîcheur d'une catégorie : poids moyen de ses membres. Une petite
  // catégorie dont les membres viennent de trop sortir passe aussi son tour
  const failures = new Map();
  // Une catégorie qui n'a pas 4 membres disponibles (poids non nul) ne peut
  // sortir qu'avec un élément trop sorti : elle ne passe qu'en dernier recours
  const freshness = new Map(
    categories.map((c) => {
      const weights = [...c.members].map(element);
      const available = weights.filter((w) => w > 0).length;
      const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
      return [c.key, available >= GROUP_SIZE ? mean : mean * SHORT_CATEGORY];
    })
  );
  const weigh = {
    // Rotation : une catégorie sortie récemment passe son tour
    // Une catégorie qui vient d'échouer (pour cette grille) perd aussi du poids :
    // sinon une catégorie impossible à remplir, jamais sortie donc « neuve »,
    // était retirée sans fin
    category: (c) =>
      Math.max(freshness.get(c.key), 1e-6) / (1 + 3 * (recent?.categories?.get(c.key) ?? 0)) ** CAT_POW / (1 + (failures.get(c.key) ?? 0)) ** 2,
    element: (id) => Math.max(element(id), 1e-6)
  };

  // Un groupe tag n'est imposé qu'une grille sur TAG_CHANCE environ :
  // imposé chaque jour, les quelques tags complets revenaient sans cesse.
  // Les autres jours, un tag peut sortir comme n'importe quelle catégorie.
  const imposeTag = usableTags.length > 0 && random() < TAG_CHANCE;
  const candidates = [];
  // D'abord sans les éléments trop sortis (poids nul), sur autant de jeux de
  // catégories qu'il faut ; s'il n'y a vraiment aucune grille sans eux, on
  // recommence en les autorisant
  // Trois recherches, chacune seulement si la précédente n'a rien trouvé :
  // 1. sans élément trop sorti (poids nul) ni catégorie sortie la veille (ou
  //    le jour même dans l'autre mode : poids de récence ≥ 1) ;
  // 2. sans élément trop sorti ;
  // 3. sans restriction.
  // Priorités : une grille sans faux groupe (la règle passe avant tout, voir
  // generatePuzzle), puis pas d'élément trop répété, puis pas de catégorie
  // reprise.
  const overused = (id) => element(id) === 0;
  const yesterday = (c) => (recent.categories?.get(c.key) ?? 0) >= 1;
  const phases = recent
    ? [
        { ...weigh, resting: overused, skip: yesterday, attempts: PHASE_ATTEMPTS, ms: PHASE_MS },
        { ...weigh, resting: overused, attempts: PHASE_ATTEMPTS, ms: PHASE_MS },
        weigh
      ]
    : [weigh];
  for (const phaseWeigh of phases) {
  const open = usable.filter((c) => !phaseWeigh.skip?.(c));
  const openTags = open.filter((c) => c.kind === "tag");
  const fullSearchUntil = Date.now() + FULL_SEARCH_MS;
  const phaseUntil = phaseWeigh.ms ? Date.now() + phaseWeigh.ms : Infinity;
  for (let attempt = 0; attempt < (phaseWeigh.attempts ?? MAX_ATTEMPTS) && candidates.length < CANDIDATES && Date.now() < phaseUntil; attempt++) {
    // La moitié des essais sans tag imposé, si aucun tirage avec tag n'aboutit
    const withTag = imposeTag && attempt < (phaseWeigh.attempts ?? MAX_ATTEMPTS) / 2;
    const first = withTag && openTags.length ? weightedShuffle(openTags, weigh.category, random).slice(0, 1) : [];
    // Au plus 2 groupes de la même sorte, pour varier (pas 3 groupes couleur)
    const chosen = [...first];
    for (const category of weightedShuffle(open.filter((c) => !first.includes(c)), weigh.category, random)) {
      if (chosen.length === GROUP_COUNT) break;
      const limit = category.kind === "tag" ? maxTags : (maxPerKind[category.kind] ?? MAX_SAME_KIND);
      if (chosen.filter((c) => c.kind === category.kind).length < limit) chosen.push(category);
    }
    if (chosen.length < GROUP_COUNT) break;

    // Sans historique, la première grille valide suffit
    const full = attempt < FULL_SEARCH_ATTEMPTS && Date.now() < fullSearchUntil;
    const samples = full ? ELEMENT_SAMPLES : SAMPLES_PER_CHOICE;
    candidates.push(...tryGroups(chosen, categories, random, rule, stats, phaseWeigh, recent ? CANDIDATES : 1, samples));
    // Catégories du jour trouvées : on s'y tient
    if (candidates.length) break;
    for (const c of chosen) failures.set(c.key, (failures.get(c.key) ?? 0) + 1);
  }
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

/**
 * Diagnostic des tags : `trials` grilles d'essai (graines 1, 2…, arrêt au bout
 * de budgetMs), en notant pour chaque catégorie combien de tirages elle a fait
 * rejeter (faux groupe, ou groupe impossible à remplir) et combien de grilles
 * réussies l'ont prise comme groupe. Long avec beaucoup de tags : à lancer
 * dans le worker.
 */
function diagnoseTags(elements, tags, options, { trials = 30, budgetMs = 15000 } = {}) {
  const stats = { incompatible: 0, decoy: 0, multiple: 0, blame: new Map() };
  const picked = new Map();
  const rules = { strict: 0, relaxed: 0, none: 0 };
  let done = 0;
  let failed = 0;
  const started = Date.now();
  for (let seed = 1; seed <= trials && Date.now() - started < budgetMs; seed++) {
    done++;
    try {
      const puzzle = generatePuzzle(elements, tags, seededRandom(seed), { ...options, stats });
      rules[puzzle.rule]++;
      for (const g of puzzle.groups) picked.set(g.key, (picked.get(g.key) ?? 0) + 1);
    } catch {
      failed++;
    }
  }
  return {
    trials: done,
    failed,
    rules,
    ms: Date.now() - started,
    rejected: { incompatible: stats.incompatible, decoy: stats.decoy, multiple: stats.multiple },
    blame: Object.fromEntries(stats.blame),
    picked: Object.fromEntries(picked)
  };
}

module.exports = {
  diagnoseTags,
  GROUP_SIZE,
  hasObviousDecoy,
  GROUP_COUNT,
  buildCategories,
  countSolutions,
  generatePuzzle,
  seededRandom
};
