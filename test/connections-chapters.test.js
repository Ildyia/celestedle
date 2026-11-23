// Catégories de chapitre de Connections : « First appears in » et « Appears in »
// (n'a besoin que du générateur, pas de la base)
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCategories, chapterList, hasObviousDecoy, sortChapters } = require("../src/services/connections-generator");

let nextId = 1;
const element = (lieu, extra = {}) => ({
  id: nextId++,
  type: `type${nextId}`,
  shape: `shape${nextId}`,
  couleur: [`colour${nextId}`],
  lieu,
  ...extra
});
const chapterCategories = (elements) => buildCategories(elements, []).filter((c) => c.kind === "chapter");
const byKey = (categories, key) => categories.find((c) => c.key === key);

test("chapitres : rangés dans l'ordre du jeu, sans doublon", () => {
  assert.deepEqual(sortChapters(["farewell", "ridge", "summit", "ridge"]), ["ridge", "summit", "farewell"]);
  assert.deepEqual(sortChapters(["unknown", "core", "city"]), ["city", "core", "unknown"]);
});

test("chapitres : libellés de « Appears in »", () => {
  assert.equal(chapterList(["core"]), "Core");
  assert.equal(chapterList(["core", "farewell"]), "Core and Farewell");
  assert.equal(chapterList(["ridge", "summit", "farewell"]), "Ridge, Summit and Farewell");
  const allButPrologue = ["city", "site", "resort", "ridge", "temple", "reflection", "summit", "core", "farewell"];
  assert.equal(chapterList(allButPrologue), "every chapter except Prologue");
  assert.equal(chapterList(["prologue", ...allButPrologue]), "every chapter");
  // Liste longue qui laisse de côté plus de deux chapitres : en entier
  assert.equal(chapterList(["city", "site", "resort", "ridge"]), "City, Site, Resort and Ridge");
});

test("chapitres : « First appears in » = premier chapitre dans l'ordre du jeu", () => {
  const snowball = element(["summit", "ridge"]);
  const wind = element(["ridge", "summit", "farewell"]);
  const spinners = element(["ridge", "temple", "reflection", "summit", "core", "farewell"]);
  const madeline = element(["prologue", "ridge"]);
  const first = byKey(chapterCategories([snowball, wind, spinners, madeline]), "chapter:first:ridge");
  assert.equal(first.label, "First appears in Ridge");
  assert.deepEqual([...first.members].sort(), [snowball.id, wind.id, spinners.id].sort());
});

test("chapitres : « Appears in » = exactement ces chapitres", () => {
  const ridgeSummitFarewell = [0, 1, 2, 3].map(() => element(["ridge", "summit", "farewell"]));
  const snowball = element(["ridge", "summit"]);
  const spinners = element(["ridge", "temple", "reflection", "summit", "core", "farewell"]);
  const categories = chapterCategories([...ridgeSummitFarewell, snowball, spinners]);
  const exact = byKey(categories, "chapter:in:ridge+summit+farewell");
  assert.equal(exact.label, "Appears in Ridge, Summit and Farewell");
  assert.deepEqual([...exact.members].sort(), ridgeSummitFarewell.map((e) => e.id).sort());
  // Plus de « Found in » : rien ne regroupe tout ce qui passe par un chapitre
  assert.equal(categories.some((c) => c.key === "chapter:ridge"), false);
});

test("chapitres : mêmes membres pour les deux familles, seul « Appears in » reste", () => {
  const onlyFarewell = [0, 1, 2, 3].map(() => element(["farewell"]));
  const categories = chapterCategories(onlyFarewell);
  assert.equal(byKey(categories, "chapter:first:farewell"), undefined);
  assert.equal(byKey(categories, "chapter:in:farewell").label, "Appears in Farewell");
  // Membres différents : les deux restent
  const onlyCore = element(["core"]);
  const coreAndFarewell = element(["core", "farewell"]);
  const mixed = chapterCategories([onlyCore, coreAndFarewell]);
  assert.equal(byKey(mixed, "chapter:in:core").members.size, 1);
  assert.equal(byKey(mixed, "chapter:first:core").members.size, 2);
});

test("chapitres : 4 éléments de 4A sans être un groupe font un faux groupe, même avec spinners dans la grille", () => {
  // Le cas qui a lancé le changement : snowball, wind, move block, green
  // booster (tous apparus dans Golden Ridge) et spinners (6 chapitres).
  // Avec « Found in Ridge », spinners faisait 5 cases : fausse piste permise.
  // Maintenant spinners est aussi « First appears in Ridge » (5 cases, permis)
  // mais les 4 « Appears in Ridge, Summit and Farewell » qui ne sont pas un
  // groupe sont un faux groupe.
  const rsf = [0, 1, 2, 3].map(() => element(["ridge", "summit", "farewell"]));
  const groups = [0, 1, 2, 3].map((g) => [0, 1, 2, 3].map(() => element([], { type: `group${g}` })));
  // Une case 4A par groupe
  const tiles = groups.flatMap((members, g) => [rsf[g].id, ...members.slice(0, 3).map((e) => e.id)]);
  const all = [...rsf, ...groups.flat()];
  for (const [g, members] of groups.entries()) for (const e of members) e.type = `group${g}`;
  for (const [g, e] of rsf.entries()) e.type = `group${g}`;
  const categories = buildCategories(all, []).map((c) => ({ ...c, usable: true }));
  const chosen = [0, 1, 2, 3].map((g) => byKey(categories, `type:group${g}`));
  assert.equal(hasObviousDecoy(tiles, chosen, categories), true);
});
