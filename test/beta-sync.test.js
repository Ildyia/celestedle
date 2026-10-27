process.env.SYNC_TOKEN = "sync-token-for-tests";
process.env.PERMANENT_OWNER_TOKEN = "permanent-owner-token-for-tests";
require("./support/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const elementsRepo = require("../src/repositories/elements");
const connectionsRepo = require("../src/repositories/connections");
const players = require("../src/services/players");
const betaSync = require("../src/services/beta-sync");
const { startServer } = require("./support/http");

let api;
test.before(async () => {
  api = await startServer();
});
test.after(() => api.close());

test("l'export de la prod demande le jeton de synchronisation", async () => {
  assert.equal((await api.request("GET", "/api/sync/export")).status, 401);
  const wrong = { Authorization: "Bearer nope" };
  assert.equal((await api.request("GET", "/api/sync/export", { headers: wrong })).status, 401);
  const ok = await api.request("GET", "/api/sync/export", {
    headers: { Authorization: "Bearer sync-token-for-tests" }
  });
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.data.elements) && Array.isArray(ok.data.tags));
});

test("l'import recopie les éléments modifiés et les tags, et retire les autres tags", () => {
  const [a, b, c] = elementsRepo.listActive();
  connectionsRepo.saveTag(null, { label: "Prod tag", description: "d", elementIds: [a.id, b.id] });
  elementsRepo.update(c.id, { shape: a.shape === "round" ? "square" : "round" });
  const fromProd = betaSync.exportForSync();
  const prodShape = elementsRepo.findById(c.id).shape;

  // La bêta a divergé : un tag en plus, un tag modifié, un élément différent
  const prodTag = connectionsRepo.listTags().find((t) => t.label === "Prod tag");
  connectionsRepo.saveTag(prodTag.id, { label: "Prod tag", description: "d", elementIds: [c.id] });
  connectionsRepo.saveTag(null, { label: "Beta only", description: "", elementIds: [a.id] });
  elementsRepo.update(c.id, { shape: prodShape === "round" ? "square" : "round" });

  betaSync.importFromSync(fromProd);
  const tags = connectionsRepo.listTags();
  assert.deepEqual(tags.map((t) => t.label), ["Prod tag"]);
  assert.deepEqual([...tags[0].elementIds].sort(), [a.id, b.id].sort());
  assert.equal(elementsRepo.findById(c.id).shape, prodShape);
});

test("le profil permanent est recréé propriétaire, une seule fois", () => {
  const first = betaSync.ensurePermanentOwner();
  const again = betaSync.ensurePermanentOwner();
  assert.equal(first.id, again.id);
  assert.equal(again.role, "owner");
  assert.equal(again.name, "Amélia");
  assert.equal(again.isAnonymous, false);
  assert.equal(players.findByToken("permanent-owner-token-for-tests").id, first.id);
});
