require("./support/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const elementsRepo = require("../src/repositories/elements");
const connections = require("../src/services/connections");
const {
  buildCategories,
  countSolutions,
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

test("générateur : 4 groupes de 4, une seule solution, au plus 2 groupes d'une même sorte", () => {
  const elements = elementsRepo.listActive();
  const categories = buildCategories(elements, []);
  for (let seed = 1; seed <= 15; seed++) {
    const puzzle = generatePuzzle(elements, [], seededRandom(seed));
    assert.equal(puzzle.groups.length, 4);
    assert.equal(new Set(puzzle.tiles).size, 16);
    assert.deepEqual(puzzle.groups.map((g) => g.level), [0, 1, 2, 3]);
    for (const group of puzzle.groups) assert.equal(group.elementIds.length, 4);
    assert.equal(countSolutions(puzzle.tiles, categories), 1);
    const kinds = puzzle.groups.map((g) => g.kind);
    for (const kind of kinds) assert.ok(kinds.filter((k) => k === kind).length <= 2);
  }
  // Même graine, même grille
  assert.deepEqual(generatePuzzle(elements, [], seededRandom(7)), generatePuzzle(elements, [], seededRandom(7)));
});

test("générateur : un tag incomplet ne sert pas de groupe, un tag complet est imposé", () => {
  const elements = elementsRepo.listActive();
  const members = elements.filter((e) => e.type === "collectibles").slice(0, 6).map((e) => e.id);
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
  assert.equal(puzzles.data.length, 7);
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
