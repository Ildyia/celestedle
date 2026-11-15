require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const { startServer } = require("./support/http");

let api;
test.before(async () => {
  api = await startServer();
});
test.after(() => api.close());

// Élément secret d'un salon (lu en base : le client ne le voit pas)
function secretOf(roomId) {
  return db.prepare("SELECT e.name FROM duel_rooms r JOIN elements e ON e.id = r.element_id WHERE r.id = ?").get(roomId).name;
}
function wrongFor(roomId, exclude = []) {
  const secret = secretOf(roomId);
  return db
    .prepare("SELECT name FROM elements WHERE is_active = 1 ORDER BY name")
    .all()
    .map((r) => r.name)
    .find((n) => n !== secret && !exclude.includes(n));
}

test("duel : salon public listé, rejoint, puis chacun joue ; le moins d'essais gagne", async () => {
  const host = await api.newPlayer();
  const guest = await api.newPlayer();

  const created = await api.request("POST", "/api/duels", { token: host.token, body: { mode: "normal", isPublic: true } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.id;
  assert.equal(created.data.status, "waiting");
  assert.equal(created.data.role, "host");

  // Listé tant qu'il attend ; pas encore jouable
  let list = await api.request("GET", "/api/duels");
  assert.ok(list.data.rooms.some((r) => r.id === id));
  assert.equal((await api.request("POST", `/api/duels/${id}/guess`, { token: host.token, body: { guess: "x" } })).status, 409);

  const joined = await api.request("POST", `/api/duels/${id}/join`, { token: guest.token });
  assert.equal(joined.status, 200, JSON.stringify(joined.data));
  assert.equal(joined.data.status, "playing");
  assert.equal(joined.data.role, "guest");
  list = await api.request("GET", "/api/duels");
  assert.ok(!list.data.rooms.some((r) => r.id === id));
  // Un troisième joueur ne peut plus entrer
  const third = await api.newPlayer();
  assert.equal((await api.request("POST", `/api/duels/${id}/join`, { token: third.token })).status, 409);

  // L'hôte se trompe une fois puis trouve ; l'invité trouve du premier coup
  const wrong = await api.request("POST", `/api/duels/${id}/guess`, { token: host.token, body: { guess: wrongFor(id) } });
  assert.equal(wrong.status, 200, JSON.stringify(wrong.data));
  assert.equal(wrong.data.state.tries, 1);

  // L'invité voit l'hôte avancer, en couleurs seulement
  let seen = await api.request("GET", `/api/duels/${id}`, { token: guest.token });
  assert.equal(seen.data.opponent.tries, 1);
  assert.equal(seen.data.opponent.rows[0].name, null);
  assert.ok(seen.data.opponent.rows[0].verdict);
  assert.equal(seen.data.me.solution, null);

  await api.request("POST", `/api/duels/${id}/guess`, { token: guest.token, body: { guess: secretOf(id) } });
  seen = await api.request("GET", `/api/duels/${id}`, { token: guest.token });
  assert.equal(seen.data.result, null, "l'hôte joue encore");
  // Partie finie : l'invité voit les essais de l'hôte en clair
  assert.ok(seen.data.opponent.rows[0].name);

  await api.request("POST", `/api/duels/${id}/guess`, { token: host.token, body: { guess: secretOf(id) } });
  const end = await api.request("GET", `/api/duels/${id}`, { token: host.token });
  assert.equal(end.data.status, "finished");
  assert.equal(end.data.result.winner, "guest");
  assert.equal(end.data.result.winnerId, guest.player.id);

  // Le duel ne compte pas dans les stats du jour
  const stats = await api.request("GET", "/api/players/me/stats?mode=normal", { token: guest.token });
  assert.equal(stats.data.played, 0);

  // Revanche : le premier la crée (privée), l'autre la rejoint
  const again = await api.request("POST", `/api/duels/${id}/rematch`, { token: host.token });
  assert.equal(again.data.isPublic, false);
  const back = await api.request("POST", `/api/duels/${id}/rematch`, { token: guest.token });
  assert.equal(back.data.id, again.data.id);
  assert.equal(back.data.status, "playing");
});

test("duel : salon privé non listé, fermé par son hôte", async () => {
  const host = await api.newPlayer();
  const created = await api.request("POST", "/api/duels", { token: host.token, body: { mode: "hard", isPublic: false } });
  const id = created.data.id;
  const list = await api.request("GET", "/api/duels");
  assert.ok(!list.data.rooms.some((r) => r.id === id));

  const other = await api.newPlayer();
  assert.equal((await api.request("POST", `/api/duels/${id}/close`, { token: other.token })).status, 403);
  const closed = await api.request("POST", `/api/duels/${id}/close`, { token: host.token });
  assert.equal(closed.data.status, "closed");
  assert.equal((await api.request("POST", `/api/duels/${id}/join`, { token: other.token })).status, 409);
  assert.equal((await api.request("GET", "/api/duels/nope")).status, 404);
});

test("duel : abandon et égalité", async () => {
  const host = await api.newPlayer();
  const guest = await api.newPlayer();
  const { data: room } = await api.request("POST", "/api/duels", { token: host.token, body: {} });
  await api.request("POST", `/api/duels/${room.id}/join`, { token: guest.token });
  await api.request("POST", `/api/duels/${room.id}/forfeit`, { token: host.token });
  await api.request("POST", `/api/duels/${room.id}/forfeit`, { token: guest.token });
  const end = await api.request("GET", `/api/duels/${room.id}`, { token: host.token });
  assert.equal(end.data.result.draw, true);
});
