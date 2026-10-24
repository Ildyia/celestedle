// Génération des grilles Connections : 4 groupes de 4 éléments qui partagent
// une catégorie (attribut ou tag), avec une seule façon de ranger les 16.

const GROUP_SIZE = 4;
const GROUP_COUNT = 4;
const MAX_ATTEMPTS = 4000;
const MAX_SAME_KIND = 2;

// Difficulté d'une sorte de catégorie : sert à ranger les groupes du plus
// facile (0) au plus dur, comme les 4 couleurs du jeu original
const KIND_LEVELS = { type: 0, colour: 1, shape: 1, chapter: 2, tag: 3 };

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

function tryGroups(chosen, categories, random) {
  const tiles = [];
  const groups = [];
  for (const category of chosen) {
    const others = chosen.filter((c) => c !== category);
    // Chaque élément ne va que dans un seul des 4 groupes choisis
    const pool = [...category.members].filter(
      (id) => !tiles.includes(id) && !others.some((o) => o.members.has(id))
    );
    if (pool.length < GROUP_SIZE) return null;
    const members = shuffle(pool, random).slice(0, GROUP_SIZE);
    tiles.push(...members);
    groups.push({ category, elementIds: members });
  }
  return countSolutions(tiles, categories) === 1 ? { groups, tiles } : null;
}

// Grille { groups: [{ key, kind, label, level, elementIds }], tiles: [16 ids] }.
// Un groupe tag est imposé quand un tag complet le permet.
function generatePuzzle(elements, tags, random = Math.random) {
  const categories = buildCategories(elements, tags);
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

    const found = tryGroups(chosen, categories, random);
    if (!found) continue;

    const groups = found.groups
      .map((g) => ({ ...g, order: KIND_LEVELS[g.category.kind] + random() / 2 }))
      .sort((a, b) => a.order - b.order)
      .map((g, level) => ({
        key: g.category.key,
        kind: g.category.kind,
        label: g.category.label,
        level,
        elementIds: g.elementIds
      }));
    return { groups, tiles: shuffle(found.tiles, random) };
  }
  throw new Error("No Connections puzzle with a single solution could be generated.");
}

module.exports = {
  GROUP_SIZE,
  GROUP_COUNT,
  buildCategories,
  countSolutions,
  generatePuzzle,
  seededRandom
};
