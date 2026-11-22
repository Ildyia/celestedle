require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const mail = require("../src/services/mail");
const mailRepo = require("../src/repositories/mail");
const { startServer } = require("./support/http");

let api;
let owner;
const discord = [];
test.before(async () => {
  api = await startServer();
  const { token } = await api.newPlayer();
  const claim = await api.request("POST", "/api/admin/claim-owner", { token, body: { password: "test-admin-password" } });
  assert.equal(claim.status, 200);
  owner = token;
  // Faux bot : garde ce qu'il aurait fait
  mail.setNotifier({
    mailPosted: async (letter, target) => {
      discord.push(["posted", letter.title, target]);
      return { channelId: target.channelId, messageId: "999" };
    },
    mailUpdated: async (letter) => discord.push(["updated", letter.title]),
    mailDeleted: async (letter) => discord.push(["deleted", letter.title])
  });
});
test.after(() => api.close());

test("boîte aux lettres : la carte postale de la mise à jour est la première lettre, lisible sans profil", async () => {
  const res = await api.request("GET", "/api/mail");
  assert.equal(res.status, 200);
  const welcome = res.data.letters.find((l) => l.slug === "welcome-v4");
  assert.equal(welcome.kind, "news");
  assert.equal(welcome.read, false);
  assert.match(welcome.body, /\*\*Celeste-style menus\*\*/);
  assert.equal((await api.request("POST", `/api/mail/${welcome.id}/read`)).status, 401);
});

test("annonce : écrite par l'équipe, lue par les joueurs, comptée, corrigée puis supprimée", async () => {
  const { token } = await api.newPlayer();
  assert.equal((await api.request("POST", "/api/admin/mail", { token, body: { title: "Hi", body: "x" } })).status, 403);
  assert.equal((await api.request("POST", "/api/admin/mail", { token: owner, body: { title: " ", body: "x" } })).status, 400);

  const sent = await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Patch notes", body: "- fixed\n- **new**" } });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.discordMessageId, null, "pas de salon réglé : rien sur Discord");

  const inbox = (await api.request("GET", "/api/mail", { token })).data.letters;
  assert.equal(inbox[0].title, "Patch notes", "la plus récente d'abord");
  assert.equal(inbox[0].read, false);
  assert.equal((await api.request("POST", `/api/mail/${sent.data.id}/read`, { token })).status, 200);
  assert.equal((await api.request("GET", "/api/mail", { token })).data.letters[0].read, true);
  const listed = (await api.request("GET", "/api/admin/mail", { token: owner })).data.letters.find((l) => l.id === sent.data.id);
  assert.equal(listed.reads, 1);

  const edited = await api.request("PUT", `/api/admin/mail/${sent.data.id}`, { token: owner, body: { title: "Patch notes 2", body: "ok" } });
  assert.equal(edited.data.title, "Patch notes 2");
  assert.equal((await api.request("DELETE", `/api/admin/mail/${sent.data.id}`, { token: owner })).status, 200);
  assert.ok(!(await api.request("GET", "/api/mail", { token })).data.letters.some((l) => l.id === sent.data.id));
  assert.equal(discord.length, 0, "jamais posté : ni modifié ni supprimé sur Discord");
});

test("Discord : salon et rôle réglés dans Settings, annonce postée, corrigée et supprimée là-bas aussi", async () => {
  const bad = await api.request("PUT", "/api/admin/settings", { token: owner, body: { discord: { channelId: "#general" } } });
  assert.equal(bad.status, 400);
  const saved = await api.request("PUT", "/api/admin/settings", { token: owner, body: { discord: { channelId: "123456789", roleId: "987654321" } } });
  assert.deepEqual(saved.data.discord, { channelId: "123456789", roleId: "987654321" });

  const quiet = await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Site only", body: "x", discord: false } });
  assert.equal(quiet.data.discordMessageId, null);
  const sent = await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Big news", body: "Hello", discord: true } });
  assert.equal(sent.data.discordMessageId, "999");
  assert.deepEqual(discord.at(-1), ["posted", "Big news", { channelId: "123456789", roleId: "987654321" }]);

  await api.request("PUT", `/api/admin/mail/${sent.data.id}`, { token: owner, body: { title: "Bigger news", body: "Hello" } });
  assert.deepEqual(discord.at(-1), ["updated", "Bigger news"]);
  await api.request("DELETE", `/api/admin/mail/${sent.data.id}`, { token: owner });
  assert.deepEqual(discord.at(-1), ["deleted", "Bigger news"]);
  await api.request("PUT", "/api/admin/settings", { token: owner, body: { discord: { channelId: "", roleId: "" } } });
});

test("lettre personnelle : visible de son seul destinataire", async () => {
  const alice = await api.newPlayer();
  const bob = await api.newPlayer();
  const now = new Date().toISOString();
  const letter = mailRepo.insert({ kind: "reply", title: "For Alice", body: "Thanks!", playerId: alice.player.id, authorId: null, at: now });
  const seen = (token) => api.request("GET", "/api/mail", { token }).then((r) => r.data.letters.find((l) => l.id === letter.id));
  assert.equal((await seen(alice.token)).personal, true);
  assert.equal(await seen(bob.token), undefined);
  assert.equal((await api.request("POST", `/api/mail/${letter.id}/read`, { token: bob.token })).status, 404);
  assert.ok(!(await api.request("GET", "/api/admin/mail", { token: owner })).data.letters.some((l) => l.id === letter.id));
});
