require("./support/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const elementsRepo = require("../src/repositories/elements");
const connections = require("../src/services/connections");
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

test("générateur : un tag incomplet ne sert pas de groupe, un tag complet est imposé", () => {
  const elements = elementsRepo.listActive();
  // Un élément de chaque type : un tag d'un seul type ferait doublon avec ce type
  const types = [...new Set(elements.map((e) => e.type))];
  const members = types.map((type) => elements.find((e) => e.type === type).id);
  const tag = { id: 1, label: "Shiny", elementIds: members, unreviewedIds: [] };

  const draft = buildCategories(elements, [{ ...tag, unreviewedIds: [elements[0].id] }]).find((c) => c.key === "tag:1");
  assert.equal(draft.usable, false);

  const puzzle = generatePuzzle(elements, [tag], seededRandom(3));
  const tagGroup = puzzle.groups.find((g) => g.kind === "tag");
  assert.ok(tagGroup, "un groupe tag est imposé quand c'est possible");
  assert.equal(tagGroup.label, "Shiny");
  assert.ok(tagGroup.elementIds.every((id) => members.includes(id)));
});

test("Connections est réservé à l'équipe admin pendant les tests", async () => {
  const { token } = await api.newPlayer();
  assert.equal((await api.request("GET", "/api/connections")).status, 401);
  assert.equal((await api.request("GET", "/api/connections", { token })).status, 403);
  assert.equal((await api.request("POST", "/api/connections/guess", { token, body: { names: [] } })).status, 403);
  assert.equal((await api.request("GET", "/api/admin/connections/tags", { token })).status, 403);
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
  assert.equal(wrong.data.result, "wrong");
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
  assert.equal(puzzles.data.length, 14, "7 jours, normal et Hard");
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

test("générateur : avec beaucoup de tags liés aux types, le mode normal reste sans faux groupe", () => {
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
    const puzzle = generatePuzzle(elements, tags, seededRandom(seed));
    assert.equal(puzzle.rule, "strict", `grille ${seed}`);
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
  const me = (await api.request("GET", "/api/players/me", { token })).data.player;
  const categories = buildCategories(elementsRepo.listActive(), []);
  // Grilles Hard d'entraînement tirées jusqu'à en avoir une avec un faux groupe
  for (let draw = 0; draw < 50; draw++) {
    await api.request("POST", "/api/connections/practice", { token, body: { mode: "hard" } });
    const row = db.prepare("SELECT groups, tiles FROM connection_puzzles WHERE date = ?").get(`practice-hard:${me.id}`);
    const groups = JSON.parse(row.groups);
    const tiles = JSON.parse(row.tiles);
    const keys = groups.map((g) => g.key);
    const four = categories
      .filter((c) => !keys.includes(c.key))
      .map((c) => tiles.filter((id) => c.members.has(id)).slice(0, 4))
      .find((ids) => ids.length === 4 && !groups.some((g) => ids.filter((id) => g.elementIds.includes(id)).length >= 3));
    if (!four) continue;
    const names = four.map((id) => elementsRepo.findById(id).nom);
    const res = await api.request("POST", "/api/connections/guess", { token, body: { names, mode: "hard", practice: true } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.result, "decoy");
    assert.equal(res.data.state.mistakes, 1, "un faux groupe compte comme une erreur");
    return;
  }
  assert.fail("aucune grille Hard avec un faux groupe en 50 tirages");
});
