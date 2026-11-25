require("./support/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const elementsRepo = require("../src/repositories/elements");
const connections = require("../src/services/connections");
const connectionsRepo = require("../src/repositories/connections");
const insightsRepo = require("../src/repositories/insights");
const { generateInWorker } = require("../src/services/connections-worker");
const {
  buildCategories,
  countSolutions,
  hasObviousDecoy,
  generatePuzzle,
  seededRandom
} = require("../src/services/connections-generator");
const { startServer } = require("./support/http");

let api;
test.before(async () => {
  api = await startServer();
});
test.after(() => api.close());

async function staffToken() {
  const owner = await api.newPlayer();
  const claim = await api.request("POST", "/api/admin/claim-owner", {
    token: owner.token,
    body: { password: "test-admin-password" }
  });
  assert.equal(claim.status, 200);
  return owner.token;
}

let ownerToken = null;
async function owner() {
  ownerToken ??= await staffToken();
  return ownerToken;
}

async function newAdministrator() {
  const { token, player } = await api.newPlayer();
  const grant = await api.request("POST", "/api/admin/team", { token: await owner(), body: { playerId: player.id } });
  assert.equal(grant.status, 201, JSON.stringify(grant.data));
  return token;
}

test("générateur : 4 groupes de 4, une seule solution, pas de faux groupe trompeur, au plus 2 groupes d'une même sorte", () => {
  const elements = elementsRepo.listActive();
  const categories = buildCategories(elements, []);
  for (let seed = 1; seed <= 15; seed++) {
    const puzzle = generatePuzzle(elements, [], seededRandom(seed));
    assert.equal(puzzle.groups.length, 4);
    assert.equal(new Set(puzzle.tiles).size, 16);
    assert.deepEqual(puzzle.groups.map((g) => g.level).sort(), [0, 1, 2, 3], "une couleur par groupe");
    for (const group of puzzle.groups) assert.equal(group.elementIds.length, 4);
    assert.equal(countSolutions(puzzle.tiles, categories), 1);
    // Cases rangées groupe par groupe, dans l'ordre des catégories
    const chosen = puzzle.groups.map((g) => categories.find((c) => c.key === g.key));
    const ordered = puzzle.groups.flatMap((g) => g.elementIds);
    assert.ok(!hasObviousDecoy(ordered, chosen, categories), "ni faux groupe de type, ni 4 cases d'une catégorie hors des groupes");
    const kinds = puzzle.groups.map((g) => g.kind);
    for (const kind of kinds) assert.ok(kinds.filter((k) => k === kind).length <= 2);
  }
  // Même graine, même grille
  assert.deepEqual(generatePuzzle(elements, [], seededRandom(7)), generatePuzzle(elements, [], seededRandom(7)));
});

test("générateur : un tag incomplet ne sert pas de groupe, un tag complet est imposé environ une grille sur deux", () => {
  const elements = elementsRepo.listActive();
  // Un élément de chaque type : un tag d'un seul type ferait doublon avec ce type
  const types = [...new Set(elements.map((e) => e.type))];
  const members = types.map((type) => elements.find((e) => e.type === type).id);
  const tag = { id: 1, label: "Shiny", elementIds: members, unreviewedIds: [] };

  const draft = buildCategories(elements, [{ ...tag, unreviewedIds: [elements[0].id] }]).find((c) => c.key === "tag:1");
  assert.equal(draft.usable, false);

  // Sur 20 grilles, le tag sort souvent (imposé une fois sur deux environ)
  // mais pas toujours : imposé chaque jour, il revenait sans cesse
  let withTag = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const tagGroup = generatePuzzle(elements, [tag], seededRandom(seed)).groups.find((g) => g.kind === "tag");
    if (!tagGroup) continue;
    withTag++;
    assert.equal(tagGroup.label, "Shiny");
    assert.ok(tagGroup.elementIds.every((id) => members.includes(id)));
  }
  assert.ok(withTag >= 6 && withTag <= 18, `tag dans ${withTag} grilles sur 20`);
});

test("partie : erreur, « à une case près », doublon, groupe trouvé puis victoire", async () => {
  const token = await owner();
  const puzzle = connections.getPuzzle();
  const names = (ids) => ids.map((id) => elementsRepo.findById(id).nom);
  const [g0, g1, g2, g3] = puzzle.groups.map((g) => names(g.elementIds));

  const start = await api.request("GET", "/api/connections", { token });
  assert.equal(start.status, 200);
  assert.equal(start.data.tiles.length, 16);
  assert.equal(start.data.found.length, 0);
  assert.equal(start.data.solution, null, "la solution n'est pas envoyée pendant la partie");

  const wrong = await api.request("POST", "/api/connections/guess", { token, body: { names: [g0[0], g1[0], g2[0], g3[0]] } });
  // 4 cases de 4 groupes : parfois un faux groupe selon la grille du jour
  assert.ok(["wrong", "decoy", "too_many"].includes(wrong.data.result));
  assert.equal(wrong.data.state.mistakes, 1);

  const close = await api.request("POST", "/api/connections/guess", { token, body: { names: [g0[0], g0[1], g0[2], g1[0]] } });
  assert.equal(close.data.result, "one_away");

  const again = await api.request("POST", "/api/connections/guess", { token, body: { names: [g1[0], g0[2], g0[1], g0[0]] } });
  assert.equal(again.status, 409, "même proposition dans un autre ordre");

  const bad = await api.request("POST", "/api/connections/guess", { token, body: { names: [g0[0], g0[0], g0[1], g0[2]] } });
  assert.equal(bad.status, 400);

  const correct = await api.request("POST", "/api/connections/guess", { token, body: { names: g0 } });
  assert.equal(correct.data.result, "correct");
  assert.equal(correct.data.state.found[0].label, puzzle.groups[0].label);
  assert.equal(correct.data.state.tiles.length, 12);

  let state;
  for (const group of [g1, g2, g3]) {
    ({ data: { state } } = await api.request("POST", "/api/connections/guess", { token, body: { names: group } }));
  }
  assert.equal(state.status, "won");
  assert.equal(state.mistakes, 2);
  assert.equal(state.solution.length, 4);

  // Profil anonyme : absent du classement tant qu'il n'est pas enregistré
  let board = await api.request("GET", "/api/connections/leaderboard", { token });
  assert.equal(board.data.top.length, 0);
  await api.request("PATCH", "/api/players/me", { token, body: { name: "Grid Tester" } });
  board = await api.request("GET", "/api/connections/leaderboard", { token });
  assert.equal(board.data.top[0].isMe, true);
  assert.equal(board.data.top[0].mistakes, 2);
  const overview = await api.request("GET", "/api/admin/overview", { token });
  assert.equal(overview.data.connections.normal.puzzle.groups.length, 4);
  assert.ok(overview.data.connections.normal.stats.wins >= 1);
  assert.ok("hard" in overview.data.connections);
  const stats = await api.request("GET", "/api/connections/stats", { token });
  assert.ok(stats.data.wins >= 1);
  assert.ok(stats.data.winRate > 0);

  // Aussi dans le classement du jour de la page principale, et compté dans le
  // classement général (tous modes)
  const daily = await api.request("GET", "/api/leaderboard?period=daily&mode=cx-normal", { token });
  assert.equal(daily.data.me.mistakes, 2);
  const global = await api.request("GET", "/api/leaderboard?period=global", { token });
  assert.ok(global.data.me.games >= 1);

  // Journal du menu : statistiques perso, Normal seulement
  const mine = await api.request("GET", "/api/connections/me/stats?mode=normal", { token });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.played, 1);
  assert.equal(mine.data.wins, 1);
  assert.equal(mine.data.avgTries, 2, "les erreurs tiennent lieu d'essais");
  assert.equal(mine.data.streak.current, 1);
  const mineHard = await api.request("GET", "/api/connections/me/stats?mode=hard", { token });
  assert.equal(mineHard.data.played, 0);
});

test("partie : perdue à la 4e erreur", async () => {
  const token = await newAdministrator();
  const puzzle = connections.getPuzzle();
  const [g0, g1, g2, g3] = puzzle.groups.map((g) => g.elementIds.map((id) => elementsRepo.findById(id).nom));
  const wrongs = [
    [g0[0], g1[0], g2[0], g3[0]],
    [g0[1], g1[1], g2[1], g3[1]],
    [g0[2], g1[2], g2[2], g3[2]],
    [g0[3], g1[3], g2[3], g3[3]]
  ];
  let state;
  for (const names of wrongs) {
    ({ data: { state } } = await api.request("POST", "/api/connections/guess", { token, body: { names } }));
  }
  assert.equal(state.status, "lost");
  assert.equal(state.solution.length, 4);
  const after = await api.request("POST", "/api/connections/guess", { token, body: { names: g0 } });
  assert.equal(after.status, 409);
  const mine = await api.request("GET", "/api/connections/me/stats", { token });
  assert.deepEqual([mine.data.played, mine.data.wins, mine.data.losses], [1, 0, 1]);
});

test("admin : tags, éléments à classer, aperçu et régénération des grilles", async () => {
  const token = await owner();
  const elements = elementsRepo.listActive();
  const ids = elements.slice(0, 5).map((e) => e.id);

  const created = await api.request("POST", "/api/admin/connections/tags", {
    token,
    body: { label: "Gives liftboost", description: "Moving solid you can jump off", elementIds: ids }
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.deepEqual([...created.data.elementIds].sort(), [...ids].sort());
  assert.equal(created.data.unreviewedIds.length, 0);

  const duplicate = await api.request("POST", "/api/admin/connections/tags", { token, body: { label: "gives LIFTBOOST", elementIds: [] } });
  assert.equal(duplicate.status, 409);

  // Un élément ajouté après le dernier enregistrement doit être classé
  db.prepare("UPDATE connection_tags SET reviewed_at = '2000-01-01 00:00:00' WHERE id = ?").run(created.data.id);
  let tags = await api.request("GET", "/api/admin/connections/tags", { token });
  assert.ok(tags.data[0].unreviewedIds.length > 0);

  const saved = await api.request("PUT", `/api/admin/connections/tags/${created.data.id}`, {
    token,
    body: { label: "Gives liftboost", elementIds: ids.slice(0, 4) }
  });
  assert.equal(saved.data.unreviewedIds.length, 0);
  assert.equal(saved.data.elementIds.length, 4);

  const puzzles = await api.request("GET", "/api/admin/connections/puzzles", { token });
  assert.equal(puzzles.data.length, 9, "3 jours, Normal, Hard et C-Side");
  assert.deepEqual(puzzles.data.slice(0, 2).map((p) => p.mode), ["normal", "hard"]);
  assert.equal(puzzles.data[0].groups.length, 4);

  const today = puzzles.data[0].date;
  const regenerated = await api.request("POST", `/api/admin/connections/puzzles/${today}/regenerate`, { token });
  assert.equal(regenerated.status, 200);
  assert.equal(regenerated.data.version, puzzles.data[0].version + 1);

  // La grille a changé : la partie gagnée plus haut repart de zéro
  const state = await api.request("GET", "/api/connections", { token });
  assert.equal(state.data.reset, true);
  assert.equal(state.data.status, "playing");

  const past = await api.request("POST", "/api/admin/connections/puzzles/2000-01-01/regenerate", { token });
  assert.equal(past.status, 400);

  const removed = await api.request("DELETE", `/api/admin/connections/tags/${created.data.id}`, { token });
  assert.equal(removed.status, 204);
  tags = await api.request("GET", "/api/admin/connections/tags", { token });
  assert.equal(tags.data.length, 0);
});

test("playtester : joue à Connections sans accès à l'admin, accès retirable", async () => {
  const { token, player } = await api.newPlayer();
  assert.equal((await api.request("GET", "/api/connections", { token })).status, 403);

  // Un administrateur peut aussi donner l'accès (compté dans son quota)
  const adminToken = await newAdministrator();
  const granted = await api.request("PUT", `/api/admin/players/${player.id}/playtester`, { token: adminToken, body: { enabled: true } });
  assert.equal(granted.status, 200, JSON.stringify(granted.data));
  assert.equal(granted.data.isPlaytester, true);
  assert.equal(granted.data.role, "player");

  const me = await api.request("GET", "/api/players/me", { token });
  assert.equal(me.data.player.isPlaytester, true);
  assert.equal((await api.request("GET", "/api/connections", { token })).status, 200);
  assert.equal((await api.request("GET", "/api/connections/leaderboard", { token })).status, 200);
  // Entraînement réservé à l'équipe admin
  assert.equal((await api.request("GET", "/api/connections?practice=1", { token })).status, 403);
  assert.equal((await api.request("POST", "/api/connections/practice", { token })).status, 403);
  assert.equal((await api.request("GET", "/api/connections-access", { token })).data.canPractice, false);

  // Aucun droit admin : ni tags, ni grilles, ni tableau de bord
  assert.equal((await api.request("GET", "/api/admin/connections/tags", { token })).status, 403);
  assert.equal((await api.request("GET", "/api/admin/overview", { token })).status, 403);
  assert.equal((await api.request("PUT", `/api/admin/players/${player.id}/playtester`, { token, body: { enabled: true } })).status, 403);

  const revoked = await api.request("PUT", `/api/admin/players/${player.id}/playtester`, { token: await owner(), body: { enabled: false } });
  assert.equal(revoked.data.isPlaytester, false);
  assert.equal((await api.request("GET", "/api/connections", { token })).status, 403);

  const audit = await api.request("GET", "/api/admin/audit", { token: await owner() });
  assert.ok(audit.data.some((a) => a.action === "playtester" && a.target === `${player.id} ajouté`));
});

test("entraînement : grille perso tirée à volonté, sans toucher la grille du jour ni le classement", async () => {
  const token = await newAdministrator();
  await api.request("PATCH", "/api/players/me", { token, body: { name: "Practice Pro" } });
  const daily = (await api.request("GET", "/api/connections", { token })).data;

  const first = await api.request("GET", "/api/connections?practice=1", { token });
  assert.equal(first.data.practice, true);
  assert.equal(first.data.tiles.length, 16);

  // Les cases de la grille d'entraînement viennent de sa propre solution
  const db = require("../src/db");
  const me = (await api.request("GET", "/api/players/me", { token })).data.player;
  const row = db.prepare("SELECT groups FROM connection_puzzles WHERE date = ?").get(`practice:${me.id}`);
  const groups = JSON.parse(row.groups).map((g) => g.elementIds.map((id) => elementsRepo.findById(id).nom));

  let state;
  for (const names of groups) {
    ({ data: { state } } = await api.request("POST", "/api/connections/guess", { token, body: { names, practice: true } }));
  }
  assert.equal(state.status, "won");
  assert.equal(state.practice, true);

  const after = await api.request("GET", "/api/connections", { token });
  assert.equal(after.data.status, daily.status, "la grille du jour n'a pas bougé");
  assert.deepEqual(after.data.tiles.map((t) => t.nom).sort(), daily.tiles.map((t) => t.nom).sort());

  const board = await api.request("GET", "/api/connections/leaderboard", { token });
  assert.ok(!board.data.top.some((e) => e.isMe), "une grille d'entraînement ne compte pas au classement");

  const fresh = await api.request("POST", "/api/connections/practice", { token });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.data.status, "playing");
  assert.equal(fresh.data.found.length, 0);
  assert.equal(fresh.data.mistakes, 0);

  const { token: playerToken } = await api.newPlayer();
  assert.equal((await api.request("POST", "/api/connections/practice", { token: playerToken })).status, 403);
});

test("générateur : 4 cases grises qui ne forment pas un groupe sont un faux groupe", () => {
  const elements = elementsRepo.listActive();
  const categories = buildCategories(elements, []);
  const byName = (n) => elementsRepo.findByName(n).id;
  // Retour des playtests : moon block, breakable tiles, zip movers, fake heart (tous gris)
  const grey = categories.find((c) => c.key === "colour:grey");
  const decoy = ["moon block", "breakable tiles", "zip movers", "fake heart"].map(byName);
  assert.ok(decoy.every((id) => grey.members.has(id)));
  // 16 cases dont ces 4 gris répartis dans des groupes différents, et aucun autre gris
  // Au plus 3 cases par type, pour que seul le faux groupe gris soit en cause
  const perType = { environment: 2, "movement & propulsion": 1, collectibles: 1 };
  const others = [];
  for (const e of elements) {
    if (others.length === 12 || e.couleur.includes("grey") || (perType[e.type] ?? 0) >= 3) continue;
    perType[e.type] = (perType[e.type] ?? 0) + 1;
    others.push(e.id);
  }
  const tiles = [decoy[0], ...others.slice(0, 3), decoy[1], ...others.slice(3, 6), decoy[2], ...others.slice(6, 9), decoy[3], ...others.slice(9, 12)];
  const chosen = categories.filter((c) => c.kind === "chapter").slice(0, 4);
  assert.equal(hasObviousDecoy(tiles, chosen, categories), true);
  assert.equal(hasObviousDecoy(tiles, chosen, categories, "relaxed"), false, "en repli, seule la règle type/tag s'applique");
  assert.equal(hasObviousDecoy(tiles, chosen, categories, "none"), false, "mode Hard : faux groupes permis");
});

test("générateur : un type (ou un tag) sur exactement 4 cases est un faux groupe, sur 5 c'est une fausse piste permise", () => {
  // 16 éléments inventés : 4 groupes par chapitre, couleurs et formes toutes
  // différentes ; `typed` d'entre eux partagent le type « shared »
  const grid = (typed) => {
    const elements = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      type: i % 4 === 0 || (typed === 5 && i === 1) ? "shared" : `type${i}`,
      shape: `shape${i}`,
      couleur: [`colour${i}`],
      lieu: [`chapter${Math.floor(i / 4)}`]
    }));
    const categories = buildCategories(elements, []).map((c) => ({ ...c, usable: true }));
    const chosen = categories.filter((c) => c.kind === "chapter");
    return { tiles: elements.map((e) => e.id), chosen, categories };
  };
  // Exactement 4 cases « shared » (une par groupe) : faux groupe parfait
  const four = grid(4);
  assert.equal(hasObviousDecoy(four.tiles, four.chosen, four.categories), true);
  assert.equal(hasObviousDecoy(four.tiles, four.chosen, four.categories, "relaxed"), true, "en repli aussi : c'est un type");
  // 5 cases : le joueur voit qu'il faut en écarter une, c'est permis
  const five = grid(5);
  assert.equal(hasObviousDecoy(five.tiles, five.chosen, five.categories), false);
});

test("générateur Hard : faux groupes permis, une seule solution", () => {
  const elements = elementsRepo.listActive();
  const categories = buildCategories(elements, []);
  let withDecoy = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const puzzle = generatePuzzle(elements, [], seededRandom(seed), { allowDecoys: true });
    assert.equal(countSolutions(puzzle.tiles, categories), 1);
    const chosen = puzzle.groups.map((g) => categories.find((c) => c.key === g.key));
    if (hasObviousDecoy(puzzle.groups.flatMap((g) => g.elementIds), chosen, categories)) withDecoy++;
  }
  assert.ok(withDecoy > 0, "les grilles Hard ont des faux groupes");
});

test("mode Hard : sa propre grille, sa partie, son classement et son entraînement", async () => {
  const token = await newAdministrator();
  await api.request("PATCH", "/api/players/me", { token, body: { name: "Hard Climber" } });
  const normal = connections.getPuzzle();
  const hard = connections.getPuzzle(undefined, "hard");
  assert.notEqual(normal.date, hard.date, "deux grilles distinctes le même jour");

  const state = await api.request("GET", "/api/connections?mode=hard", { token });
  assert.equal(state.data.mode, "hard");
  assert.match(state.data.gridId, /^hard:/);

  const names = hard.groups.map((g) => g.elementIds.map((id) => elementsRepo.findById(id).nom));
  let result;
  for (const group of names) {
    ({ data: result } = await api.request("POST", "/api/connections/guess", { token, body: { names: group, mode: "hard" } }));
  }
  assert.equal(result.state.status, "won");
  assert.equal(result.state.mode, "hard");

  // La partie normale de ce joueur n'a pas bougé
  const normalState = await api.request("GET", "/api/connections", { token });
  assert.equal(normalState.data.status, "playing");
  assert.equal(normalState.data.found.length, 0);

  const hardBoard = await api.request("GET", "/api/connections/leaderboard?mode=hard", { token });
  assert.ok(hardBoard.data.top.some((e) => e.isMe));
  const normalBoard = await api.request("GET", "/api/connections/leaderboard", { token });
  assert.ok(!normalBoard.data.top.some((e) => e.isMe));

  const practice = await api.request("POST", "/api/connections/practice", { token, body: { mode: "hard" } });
  assert.equal(practice.data.mode, "hard");
  assert.equal(practice.data.practice, true);
  assert.match(practice.data.gridId, /^practice-hard:/);

  assert.equal((await api.request("GET", "/api/connections?mode=expert", { token })).status, 400);

  const regenerated = await api.request("POST", `/api/admin/connections/puzzles/${state.data.date}/regenerate`, {
    token: await owner(),
    body: { mode: "hard" }
  });
  assert.equal(regenerated.data.mode, "hard");
  assert.equal(connections.getPuzzle().version, normal.version, "régénérer le Hard ne touche pas le normal");
});

test("erreur serveur : l'équipe admin reçoit le message, les joueurs non", async () => {
  const original = connections.puzzlePreview;
  connections.puzzlePreview = () => {
    throw new TypeError("boom");
  };
  try {
    const res = await api.request("GET", "/api/admin/connections/puzzles", { token: await owner() });
    assert.equal(res.status, 200, "une grille en échec n'empêche pas les autres");
    assert.equal(res.data[0].error, "TypeError: boom");
  } finally {
    connections.puzzlePreview = original;
  }
});

test("générateur : un tag qui couvre presque tout le catalogue ne bloque plus la génération", () => {
  const elements = elementsRepo.listActive();
  const huge = { id: 9, label: "Almost everything", elementIds: elements.slice(0, 90).map((e) => e.id), unreviewedIds: [] };
  for (const allowDecoys of [false, true]) {
    const puzzle = generatePuzzle(elements, [huge], seededRandom(1), { allowDecoys });
    assert.equal(puzzle.groups.length, 4);
    assert.ok(!puzzle.groups.some((g) => g.kind === "tag"), "un tag hors limites ne sert pas de groupe");
  }
});

test("générateur : avec beaucoup de tags liés aux types, le mode normal reste sans faux groupe et a au moins un tag", () => {
  const elements = elementsRepo.listActive();
  const types = [...new Set(elements.map((e) => e.type))];
  const random = seededRandom(5);
  // 13 tags dont la plupart des membres viennent de 2 types, comme en prod
  const tags = [14, 13, 8, 28, 11, 9, 14, 10, 10, 12, 10, 19, 10].map((size, i) => {
    const favourite = [types[i % types.length], types[(i + 2) % types.length]];
    const shuffled = (list) => list.map((e) => [random(), e]).sort((a, b) => a[0] - b[0]).map(([, e]) => e);
    const inFavourite = shuffled(elements.filter((e) => favourite.includes(e.type)));
    const rest = shuffled(elements.filter((e) => !favourite.includes(e.type)));
    const k = Math.min(inFavourite.length, Math.round(size * 0.7));
    const members = [...inFavourite.slice(0, k), ...rest.slice(0, size - k)];
    return { id: i + 1, label: `Tag ${i}`, elementIds: members.map((e) => e.id), unreviewedIds: [] };
  });
  const categories = buildCategories(elements, tags);
  for (let seed = 1; seed <= 10; seed++) {
    // Comme le mode normal : un groupe tag au moins (plus de maximum)
    const puzzle = generatePuzzle(elements, tags, seededRandom(seed), { minTags: 1 });
    assert.equal(puzzle.rule, "strict", `grille ${seed}`);
    assert.ok(puzzle.groups.some((g) => g.kind === "tag"), `grille ${seed} : sans tag`);
    const chosen = puzzle.groups.map((g) => categories.find((c) => c.key === g.key));
    const ordered = puzzle.groups.flatMap((g) => g.elementIds);
    assert.equal(hasObviousDecoy(ordered, chosen, categories), false);
    assert.equal(countSolutions(puzzle.tiles, categories), 1);
  }
});

test("suggestions de tags : envoyées par un playtester, relues et retirées par l'équipe admin", async () => {
  const { token, player } = await api.newPlayer();
  assert.equal((await api.request("POST", "/api/connections/tag-suggestions", { token, body: { label: "Has wings" } })).status, 403);
  await api.request("PUT", `/api/admin/players/${player.id}/playtester`, { token: await owner(), body: { enabled: true } });

  assert.equal((await api.request("POST", "/api/connections/tag-suggestions", { token, body: { label: "x" } })).status, 400);
  const sent = await api.request("POST", "/api/connections/tag-suggestions", {
    token,
    body: { label: "  Has wings ", elements: "Winged strawberry, Theo", note: "Visible wings on the sprite" }
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));

  // Ni le playtester ni personne hors de l'équipe ne voit la liste
  assert.equal((await api.request("GET", "/api/admin/connections/suggestions", { token })).status, 403);
  const list = await api.request("GET", "/api/admin/connections/suggestions", { token: await owner() });
  const suggestion = list.data.find((s) => s.id === sent.data.id);
  assert.equal(suggestion.label, "Has wings");
  assert.equal(suggestion.elements, "Winged strawberry, Theo");
  assert.equal(suggestion.note, "Visible wings on the sprite");
  assert.ok(suggestion.playerName);

  const removed = await api.request("DELETE", `/api/admin/connections/suggestions/${suggestion.id}`, { token: await owner() });
  assert.equal(removed.status, 204);
  const again = await api.request("DELETE", `/api/admin/connections/suggestions/${suggestion.id}`, { token: await owner() });
  assert.equal(again.status, 404);
});

test("grille remplacée pendant la partie : le joueur est prévenu au lieu d'une erreur de case", async () => {
  const token = await newAdministrator();
  const before = (await api.request("GET", "/api/connections?practice=1", { token })).data;
  await api.request("POST", "/api/connections/practice", { token });
  const names = before.tiles.slice(0, 4).map((t) => t.nom);
  const stale = await api.request("POST", "/api/connections/guess", {
    token,
    body: { names, practice: true, gridId: before.gridId }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.details.gridChanged, true);

  const now = (await api.request("GET", "/api/connections?practice=1", { token })).data;
  const ok = await api.request("POST", "/api/connections/guess", {
    token,
    body: { names: now.tiles.slice(0, 4).map((t) => t.nom), practice: true, gridId: now.gridId }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test("faux groupe : 4 cases qui partagent une catégorie sans être un groupe sont signalées", async () => {
  const token = await newAdministrator();
  const staff = await owner();
  const me = (await api.request("GET", "/api/players/me", { token })).data.player;
  await api.request("POST", "/api/connections/practice", { token, body: { mode: "normal" } });
  const { groups } = db.prepare("SELECT groups FROM connection_puzzles WHERE date = ?").get(`practice:${me.id}`);
  const [g0, g1, g2, g3] = JSON.parse(groups).map((g) => g.elementIds);
  // 4 cases, une par groupe, qui n'ont aucun point commun pour l'instant
  const categories = buildCategories(elementsRepo.listActive(), connectionsRepo.listTags());
  const unrelated = (ids) => !categories.some((c) => ids.every((id) => c.members.has(id)));
  let four = null;
  for (const a of g0) for (const b of g1) for (const c of g2) for (const d of g3) four ??= unrelated([a, b, c, d]) ? [a, b, c, d] : null;
  assert.ok(four, "4 cases sans point commun");
  const names = (ids) => ids.map((id) => elementsRepo.findById(id).nom);
  const guess = (ids) => api.request("POST", "/api/connections/guess", { token, body: { names: names(ids), practice: true } });
  const tag = (label, elementIds) => api.request("POST", "/api/admin/connections/tags", { token: staff, body: { label, elementIds } });

  // Un tag sur exactement ces 4 cases : faux groupe
  const exact = (await tag("Exactly four", four)).data;
  const decoy = await guess(four);
  assert.equal(decoy.status, 200, JSON.stringify(decoy.data));
  assert.equal(decoy.data.result, "decoy");
  assert.equal(decoy.data.state.mistakes, 1, "un faux groupe compte comme une erreur");

  // Un tag sur 5 cases : l'une des 4 choisies est d'un autre groupe
  const fifth = g0.find((id) => id !== four[0]);
  const wide = (await tag("Five of them", [...four, fifth])).data;
  const tooMany = await guess([fifth, ...four.slice(1)]);
  assert.equal(tooMany.data.result, "too_many");
  assert.equal(tooMany.data.sharedBy, 5);

  for (const t of [exact, wide]) await api.request("DELETE", `/api/admin/connections/tags/${t.id}`, { token: staff });
});

test("accès à Connections : équipe seulement, playtest ou ouvert à tous", async () => {
  const { token: playtesterToken, player } = await api.newPlayer();
  await api.request("PUT", `/api/admin/players/${player.id}/playtester`, { token: await owner(), body: { enabled: true } });
  const { token: playerToken } = await api.newPlayer();
  const status = async (token) => (await api.request("GET", "/api/connections", { token })).status;
  const setAccess = (access, token) => api.request("PUT", "/api/admin/connections/access", { token, body: { access } });

  // Par défaut : playtest. Un joueur ordinaire n'a accès à rien de Connections
  assert.equal((await api.request("GET", "/api/connections-access")).data.access, "playtest");
  assert.equal(await status(playtesterToken), 200);
  assert.equal(await status(playerToken), 403);
  assert.equal(await status(undefined), 401);
  assert.equal((await api.request("POST", "/api/connections/guess", { token: playerToken, body: { names: [] } })).status, 403);
  assert.equal((await api.request("GET", "/api/leaderboard?period=daily&mode=cx-normal", { token: playerToken })).status, 403);
  assert.equal((await api.request("GET", "/api/admin/connections/tags", { token: playtesterToken })).status, 403, "playtester : pas d'admin");

  assert.equal((await setAccess("public", playtesterToken)).status, 403, "réglage réservé à l'équipe");
  assert.equal((await setAccess("open", await owner())).status, 400);

  assert.equal((await setAccess("public", await owner())).status, 200);
  assert.equal(await status(playerToken), 200);
  assert.equal(await status(undefined), 200, "ouvert à tous : jouable avant d'avoir un profil");
  assert.equal((await api.request("POST", "/api/connections/guess", { body: { names: [] } })).status, 401);
  assert.equal((await api.request("GET", "/api/connections-access", { token: playerToken })).data.canPlay, true);

  assert.equal((await setAccess("staff", await owner())).status, 200);
  assert.equal(await status(playtesterToken), 403, "playtest en pause");
  assert.equal(await status(await owner()), 200);

  assert.equal((await setAccess("playtest", await owner())).status, 200);
  assert.equal(await status(playtesterToken), 200);
});

test("indices : chacun une fois, 3 en normal et 1 en Hard, comptés au classement", async () => {
  const token = await newAdministrator();
  await api.request("PATCH", "/api/players/me", { token, body: { name: "Hint Seeker" } });
  const puzzle = connections.getPuzzle();
  const hint = (type, mode = "normal") => api.request("POST", "/api/connections/hint", { token, body: { type, mode } });

  let state = (await api.request("GET", "/api/connections", { token })).data;
  assert.equal(state.maxHints, 3);
  assert.deepEqual(state.hints, []);

  assert.equal((await hint("everything")).status, 400);
  const kinds = await hint("kinds");
  assert.equal(kinds.status, 200, JSON.stringify(kinds.data));
  assert.deepEqual(kinds.data.state.hints[0].kinds, puzzle.groups.map((g) => g.kind).sort());
  assert.equal((await hint("kinds")).status, 409, "déjà utilisé");

  const category = (await hint("category")).data.state.hints[1];
  const named = puzzle.groups.find((g) => g.label === category.label);
  assert.ok(named, "le nom d'un vrai groupe");
  if (puzzle.groups.some((g) => g.kind === "tag")) assert.equal(category.kind, "tag", "le tag d'abord");

  state = (await hint("pair")).data.state;
  const ids = state.hints[2].tiles.map((t) => puzzle.tiles.find((id) => elementsRepo.findById(id).nom === t.nom));
  assert.equal(ids.length, 2);
  const group = puzzle.groups.find((g) => g.elementIds.includes(ids[0]));
  assert.ok(group.elementIds.includes(ids[1]), "les 2 cases vont ensemble");
  assert.notEqual(group.label, named.label, "un autre groupe que celui déjà nommé");
  assert.equal(state.status, "playing", "un indice ne fait pas perdre");
  assert.equal(state.mistakes, 0);

  // Hard : un seul indice
  assert.equal((await hint("pair", "hard")).status, 200);
  const second = await hint("kinds", "hard");
  assert.equal(second.status, 409);
  assert.match(second.data.error, /No hints left/);

  // Victoire : les indices comptent au classement du jour
  for (const g of puzzle.groups) {
    const names = g.elementIds.map((id) => elementsRepo.findById(id).nom);
    state = (await api.request("POST", "/api/connections/guess", { token, body: { names } })).data.state;
  }
  assert.equal(state.status, "won");
  const board = await api.request("GET", "/api/connections/leaderboard", { token });
  const me = board.data.top.find((e) => e.isMe);
  assert.equal(me.hints, 3);
  assert.equal(me.mistakes, 0);
  assert.equal((await hint("kinds")).status, 409, "partie finie");
});

test("générateur : un seul groupe chapitre en normal ; le worker tire la même grille", async () => {
  const elements = elementsRepo.listActive();
  const options = { maxTags: 1, maxPerKind: { chapter: 1 } };
  for (let seed = 1; seed <= 30; seed++) {
    const puzzle = generatePuzzle(elements, [], seededRandom(seed), options);
    assert.ok(puzzle.groups.filter((g) => g.kind === "chapter").length <= 1, "au plus un groupe chapitre");
  }
  // Calculée dans le worker (le serveur ne bloque pas) : même grille, même graine
  const direct = generatePuzzle(elements, [], seededRandom(42), options);
  const inWorker = await generateInWorker(elements, [], 42, options);
  assert.deepEqual(inWorker, direct);
});

test("insights : Connections (issues, erreurs, sortes de groupes, pièges)", async () => {
  const token = await newAdministrator();
  const puzzle = connections.getPuzzle();
  const names = (ids) => ids.map((id) => elementsRepo.findById(id).nom);
  const groups = puzzle.groups.map((g) => names(g.elementIds));
  const before = (await api.request("GET", "/api/admin/insights?days=7", { token: await owner() })).data.connections;
  const wonBefore = before.modes.normal?.outcomes.won ?? 0;

  const wrong = await api.request("POST", "/api/connections/guess", { token, body: { names: groups.map((g) => g[0]) } });
  assert.equal(wrong.status, 200, JSON.stringify(wrong.data));
  for (const g of groups) await api.request("POST", "/api/connections/guess", { token, body: { names: g } });

  const after = (await api.request("GET", "/api/admin/insights?days=7", { token: await owner() })).data.connections;
  const m = after.modes.normal;
  assert.equal(m.outcomes.won, wonBefore + 1);
  assert.ok(m.mistakes.reduce((a, b) => a + b, 0) >= 1);
  assert.equal(m.kinds.reduce((s, k) => s + k.seen, 0), (wonBefore + 1 + m.outcomes.lost) * 4);
  assert.ok(after.decoys.length > 0);
  assert.ok(Array.isArray(after.hardest));
});

test("fiche d'un élément : ses grilles Connections, ses pièges, ses tags", async () => {
  const { token } = await api.newPlayer();
  const puzzle = connections.getPuzzle();
  const [first, second] = puzzle.groups;
  const element = elementsRepo.findById(first.elementIds[0]);
  // Une erreur avec l'élément, puis le groupe trouvé
  const wrong = [first.elementIds[0], ...second.elementIds.slice(0, 3)].map((id) => elementsRepo.findById(id).nom);
  await api.request("POST", "/api/connections/guess", { token, body: { names: wrong } });
  await api.request("POST", "/api/connections/guess", { token, body: { names: first.elementIds.map((id) => elementsRepo.findById(id).nom) } });

  const staff = await owner();
  const res = await api.request("GET", `/api/admin/elements/${element.id}/insights`, { token: staff });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const grid = res.data.connections.grids.find((g) => g.label === first.label && g.mode === "normal");
  assert.ok(grid, JSON.stringify(res.data.connections));
  assert.ok(res.data.connections.decoys >= 1);
  assert.ok(Array.isArray(res.data.secrets) && Array.isArray(res.data.tags));
  assert.equal(typeof res.data.guesses.times, "number");
  // Sur 7 jours : la grille du jour y est encore ; depuis demain, plus rien
  const week = await api.request("GET", `/api/admin/elements/${element.id}/insights?days=7`, { token: staff });
  assert.ok(week.data.connections.grids.some((g) => g.label === first.label));
  assert.ok(week.data.since > "2000-01-01");
  const old = insightsRepo.elementInsights(element.id, "2000-01-01", "2000-01-01");
  assert.deepEqual([old.connections.grids.length, old.secrets.length, old.guesses.times], [0, 0, 0]);
  assert.equal((await api.request("GET", "/api/admin/elements/999999/insights", { token: staff })).status, 404);
  assert.equal((await api.request("GET", `/api/admin/elements/${element.id}/insights`, { token })).status, 403);
});

test("diagnostic des tags : grilles d'essai dans le worker, réservé à l'équipe", async () => {
  const token = await owner();
  const ids = elementsRepo.listActive().slice(0, 6).map((e) => e.id);
  const created = await api.request("POST", "/api/admin/connections/tags", { token, body: { label: "Diag tag", elementIds: ids } });
  assert.equal(created.status, 201, JSON.stringify(created.data));

  const res = await api.request("GET", "/api/admin/connections/tags/diagnostics", { token });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(res.data.summary.normal.trials > 0);
  const row = res.data.tags.find((t) => t.id === created.data.id);
  assert.equal(row.size, 6);
  assert.ok(row.trials.normal && row.trials.hard && row.daily);

  const { token: playerToken } = await api.newPlayer();
  assert.equal((await api.request("GET", "/api/admin/connections/tags/diagnostics", { token: playerToken })).status, 403);
  await api.request("DELETE", `/api/admin/connections/tags/${created.data.id}`, { token });
});

test("générateur : un élément trop sorti (plafond) n'est plus pioché, la grille reste stricte", () => {
  const elements = elementsRepo.listActive();
  const oshiro = elements.find((e) => e.nom.toLowerCase() === "oshiro");
  // Sorti 20 fois ces 30 derniers jours, les autres une fois
  const counts = new Map(elements.map((e) => [e.id, e.id === oshiro.id ? 20 : 1]));
  const recent = { elements: new Map(), categories: new Map(), counts };
  let withOshiro = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const puzzle = generatePuzzle(elements, [], seededRandom(seed), { maxTags: 1, maxPerKind: { chapter: 1 }, recent });
    assert.equal(puzzle.rule, "strict");
    if (puzzle.tiles.includes(oshiro.id)) withOshiro++;
  }
  assert.equal(withOshiro, 0, "Oshiro au-dessus du plafond : jamais pioché quand on peut s'en passer");
});

test("tags : difficulté enregistrée, gardée si elle n'est pas renvoyée, refusée hors de 1 à 3", async () => {
  const token = await owner();
  const ids = elementsRepo.listActive().slice(0, 6).map((e) => e.id);
  const created = await api.request("POST", "/api/admin/connections/tags", { token, body: { label: "Difficulty test", elementIds: ids, difficulty: 3 } });
  assert.equal(created.status, 201);
  assert.equal(created.data.difficulty, 3);
  // Sans difficulté dans la modification : on garde la sienne
  const renamed = await api.request("PUT", `/api/admin/connections/tags/${created.data.id}`, { token, body: { label: "Difficulty test 2", elementIds: ids } });
  assert.equal(renamed.data.difficulty, 3);
  const bad = await api.request("PUT", `/api/admin/connections/tags/${created.data.id}`, { token, body: { label: "Difficulty test 2", elementIds: ids, difficulty: 5 } });
  assert.equal(bad.status, 400);
  // Un nouveau tag sans difficulté est moyen
  const plain = await api.request("POST", "/api/admin/connections/tags", { token, body: { label: "Difficulty default", elementIds: ids } });
  assert.equal(plain.data.difficulty, 2);
  for (const t of [created.data, plain.data]) await api.request("DELETE", `/api/admin/connections/tags/${t.id}`, { token });
});

test("générateur : difficulté des tags pondérée selon le mode, au moins un tag en Normal", () => {
  const elements = elementsRepo.listActive();
  // Deux tags de même forme (mêmes types mélangés), l'un facile, l'autre difficile
  const byType = new Map();
  for (const e of elements) byType.set(e.type, [...(byType.get(e.type) ?? []), e.id]);
  const pools = [...byType.values()];
  const pick = (offset) => pools.flatMap((ids) => ids.slice(offset, offset + 2)).slice(0, 8);
  const tags = [
    { id: 1, label: "Easy tag", difficulty: 1, elementIds: pick(0), unreviewedIds: [] },
    { id: 2, label: "Hard tag", difficulty: 3, elementIds: pick(2), unreviewedIds: [] }
  ];
  const normal = { minTags: 1, tagWeights: { 1: 2, 2: 1, 3: 0.35 }, maxPerKind: { chapter: 1 } };
  const hard = { allowDecoys: true, tagWeights: { 1: 0.5, 2: 1, 3: 2 } };
  const count = (options) => {
    const seen = { 1: 0, 2: 0 };
    let withoutTag = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const puzzle = generatePuzzle(elements, tags, seededRandom(seed), options);
      const keys = puzzle.groups.filter((g) => g.kind === "tag").map((g) => Number(g.key.split(":")[1]));
      if (!keys.length) withoutTag++;
      for (const k of keys) seen[k]++;
    }
    return { seen, withoutTag };
  };
  const a = count(normal);
  assert.equal(a.withoutTag, 0, "Normal : toujours un tag");
  assert.ok(a.seen[1] > a.seen[2], `Normal : le facile d'abord (${JSON.stringify(a.seen)})`);
  const b = count(hard);
  assert.ok(b.seen[2] > b.seen[1], `Hard : le difficile d'abord (${JSON.stringify(b.seen)})`);
});

test("C-Side : réservée aux playtesters, grilles de tags seulement, sans indice « kinds »", async () => {
  const token = await owner();
  // 6 tags disjoints de 6 éléments : de quoi tirer une grille sans ambiguïté
  const ids = elementsRepo.listActive().map((e) => e.id);
  const created = [];
  for (let i = 0; i < 6; i++) {
    const res = await api.request("POST", "/api/admin/connections/tags", {
      token,
      body: { label: `C-Side tag ${i}`, elementIds: ids.slice(i * 6, i * 6 + 6) }
    });
    assert.equal(res.status, 201);
    created.push(res.data);
  }

  // Joueur sans accès : Connections en playtest, et la C-Side aussi
  const outsider = await api.newPlayer();
  assert.equal((await api.request("GET", "/api/connections?mode=custom", { token: outsider.token })).status, 403);

  const tester = await api.newPlayer();
  await api.request("PUT", `/api/admin/players/${tester.player.id}/playtester`, { token, body: { enabled: true } });
  const access = await api.request("GET", "/api/connections-access", { token: tester.token });
  assert.deepEqual(access.data.cside, { access: "playtest", canPlay: true });

  const state = await api.request("GET", "/api/connections?mode=custom", { token: tester.token });
  assert.equal(state.status, 200);
  assert.equal(state.data.mode, "custom");
  assert.deepEqual(state.data.hintTypes, ["category", "pair"]);
  assert.equal(state.data.maxHints, 2);
  // Grille de tags seulement (vue côté admin)
  const grid = connections.getPuzzle(undefined, "custom");
  assert.ok(grid.groups.every((g) => g.kind === "tag"));

  const kinds = await api.request("POST", "/api/connections/hint", { token: tester.token, body: { type: "kinds", mode: "custom" } });
  assert.equal(kinds.status, 400);
  const category = await api.request("POST", "/api/connections/hint", { token: tester.token, body: { type: "category", mode: "custom" } });
  assert.equal(category.status, 200);

  // Fermée : même les playtesters ne la voient plus
  assert.equal((await api.request("PUT", "/api/admin/connections/cside-access", { token, body: { access: "closed" } })).status, 200);
  assert.equal((await api.request("GET", "/api/connections?mode=custom", { token: tester.token })).status, 403);
  await api.request("PUT", "/api/admin/connections/cside-access", { token, body: { access: "playtest" } });

  for (const t of created) await api.request("DELETE", `/api/admin/connections/tags/${t.id}`, { token });
});

test("signaler un groupe : seulement une fois vu, devient un report masqué comme spoiler", async () => {
  const { token, player } = await api.newPlayer();
  await api.request("PUT", `/api/admin/players/${player.id}/playtester`, { token: await owner(), body: { enabled: true } });
  const puzzle = connections.getPuzzle(undefined, "normal");
  const name = (id) => elementsRepo.findById(id).nom;
  const member = name(puzzle.groups[0].elementIds[0]);
  const report = (body) => api.request("POST", "/api/connections/report-group", { token, body: { mode: "normal", groupIndex: 0, ...body } });

  // Partie pas commencée : le groupe n'a pas été vu
  assert.equal((await report({ issue: "extra", element: member })).status, 403);

  // 4 erreurs (une case de chaque groupe) : la partie est perdue, tout est révélé
  for (let i = 0; i < 4; i++) {
    const wrong = puzzle.groups.map((g) => name(g.elementIds[i]));
    const res = await api.request("POST", "/api/connections/guess", { token, body: { names: wrong, mode: "normal" } });
    assert.equal(res.status, 200);
  }
  const state = await api.request("GET", "/api/connections?mode=normal", { token });
  assert.equal(state.data.status, "lost");
  assert.equal(state.data.solution[0].index, 0);

  assert.equal((await report({ issue: "missing", element: member })).status, 400, "déjà dans le groupe");
  assert.equal((await report({ issue: "wrong", element: member })).status, 400);
  const sent = await report({ issue: "extra", element: member, note: "It doesn't fit" });
  assert.equal(sent.status, 201);
  const list = await api.request("GET", "/api/reports");
  const created = list.data.reports.find((r) => r.id === sent.data.id);
  assert.equal(created.bugType, "Wrong category (Connections)");
  assert.equal(created.isSpoiler, true);
  assert.match(created.description, new RegExp(`"${puzzle.groups[0].label}".*${member} shouldn't be in it\\. It doesn't fit`));
});
