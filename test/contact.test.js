require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./support/http");

let api;
let owner;
test.before(async () => {
  api = await startServer();
  ({ token: owner } = await api.newPlayer());
  const claim = await api.request("POST", "/api/admin/claim-owner", { token: owner, body: { password: "test-admin-password" } });
  assert.equal(claim.status, 200);
});
test.after(() => api.close());

test("contact : un joueur écrit à l'équipe, l'admin répond dans sa boîte aux lettres", async () => {
  // Sans profil : refusé ; message vide : refusé
  assert.equal((await api.request("POST", "/api/contact", { body: { topic: "idea", body: "Hello" } })).status, 401);
  const { token, player } = await api.newPlayer();
  assert.equal((await api.request("POST", "/api/contact", { token, body: { topic: "idea", body: "   " } })).status, 400);

  const sent = await api.request("POST", "/api/contact", { token, body: { topic: "idea", body: "A C-Side with only Badeline categories?" } });
  assert.equal(sent.status, 201);

  // Réservé à l'équipe
  assert.equal((await api.request("GET", "/api/admin/contact", { token })).status, 403);
  const list = await api.request("GET", "/api/admin/contact", { token: owner });
  const message = list.data.messages.find((m) => m.id === sent.data.id);
  assert.equal(message.topic, "idea");
  assert.equal(message.status, "new");
  assert.equal(message.playerId, player.id);
  assert.equal(list.data.topics.idea, "Idea");

  // Réponse : une lettre personnelle, et le message passe en « done »
  const reply = await api.request("POST", `/api/admin/contact/${message.id}/reply`, { token: owner, body: { body: "Great idea!" } });
  assert.equal(reply.status, 201);
  const inbox = await api.request("GET", "/api/mail", { token });
  const letter = inbox.data.letters.find((l) => l.kind === "reply" && l.title === "About your message");
  assert.ok(letter, "lettre reçue");
  const after = (await api.request("GET", "/api/admin/contact", { token: owner })).data.messages.find((m) => m.id === message.id);
  assert.equal(after.status, "done");
  assert.equal(after.replies.length, 1);

  // Rouvrir, puis supprimer
  assert.equal((await api.request("PUT", `/api/admin/contact/${message.id}`, { token: owner, body: { status: "new" } })).data.status, "new");
  assert.equal((await api.request("PUT", `/api/admin/contact/${message.id}`, { token: owner, body: { status: "nope" } })).status, 400);
  assert.equal((await api.request("DELETE", `/api/admin/contact/${message.id}`, { token: owner })).status, 204);
  assert.equal((await api.request("DELETE", `/api/admin/contact/${message.id}`, { token: owner })).status, 404);
});
