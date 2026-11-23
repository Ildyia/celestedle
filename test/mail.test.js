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
  assert.equal(welcome.topic, "patch-notes", "la carte postale de la mise à jour : des notes de mise à jour");
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

test("Discord : salon et rôle de chaque sorte réglés par le bot, annonce postée, corrigée et supprimée là-bas aussi", async () => {
  assert.throws(() => mail.setDiscordDestination("announcement", "#general"), /numbers/);
  assert.throws(() => mail.setDiscordDestination("gossip", "123456"), /Unknown kind/);
  mail.setDiscordDestination("announcement", "123456789", "987654321");

  const quiet = await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Site only", body: "x", discord: false } });
  assert.equal(quiet.data.discordMessageId, null);
  const sent = await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Big news", body: "Hello", discord: true } });
  assert.equal(sent.data.discordMessageId, "999");
  assert.equal(sent.data.topic, "announcement");
  assert.deepEqual(discord.at(-1), ["posted", "Big news", { channelId: "123456789", roleId: "987654321" }]);

  // Notes de mise à jour et sondages : dans le salon des annonces tant
  // qu'ils n'ont pas le leur, puis dans le leur
  await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Patch 1", body: "x", topic: "patch-notes", discord: true } });
  assert.deepEqual(discord.at(-1)[2], { channelId: "123456789", roleId: "987654321" });
  mail.setDiscordDestination("patch-notes", "555555", null);
  mail.setDiscordDestination("poll", "666666", "777777");
  const patch = await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Patch 2", body: "x", topic: "patch-notes", discord: true } });
  assert.equal(patch.data.topic, "patch-notes");
  assert.deepEqual(discord.at(-1)[2], { channelId: "555555", roleId: null });
  await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Poll", body: "x", kind: "poll", options: ["A", "B"], discord: true } });
  assert.deepEqual(discord.at(-1)[2], { channelId: "666666", roleId: "777777" });

  await api.request("PUT", `/api/admin/mail/${sent.data.id}`, { token: owner, body: { title: "Bigger news", body: "Hello" } });
  assert.deepEqual(discord.at(-1), ["updated", "Bigger news"]);
  await api.request("DELETE", `/api/admin/mail/${sent.data.id}`, { token: owner });
  assert.deepEqual(discord.at(-1), ["deleted", "Bigger news"]);
  const settingsRepo = require("../src/repositories/settings");
  for (const key of ["discord_mail_channel_id", "discord_patch_channel_id", "discord_poll_channel_id"]) settingsRepo.set(key, "");
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

test("sondage : cases validées, résultats cachés avant de voter, vote changé, fermé par l'équipe", async () => {
  const bad = (body) => api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Q", body: "x", kind: "poll", ...body } });
  assert.equal((await bad({ options: ["Only one"] })).status, 400);
  assert.equal((await bad({ options: ["Same", "same"] })).status, 400);
  assert.equal((await bad({ options: ["A", "B"], closesAt: "2000-01-01T00:00:00Z" })).status, 400);

  const sent = await bad({ title: "What next?", options: ["Stamps", "A third game", "Weekly challenges"], multiple: true });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const id = sent.data.id;
  const alice = await api.newPlayer();
  const bob = await api.newPlayer();
  const letterOf = async (token) => (await api.request("GET", "/api/mail", { token })).data.letters.find((l) => l.id === id);

  const before = (await letterOf(alice.token)).poll;
  assert.equal(before.multiple, true);
  assert.deepEqual(before.options.map((o) => o.votes), [null, null, null], "pas de résultats avant d'avoir voté");

  const vote = (token, choices) => api.request("POST", `/api/mail/${id}/vote`, { token, body: { choices } });
  assert.equal((await vote(alice.token, [])).status, 400);
  assert.equal((await vote(alice.token, [7])).status, 400);
  const voted = await vote(alice.token, [0, 2]);
  assert.equal(voted.status, 200, JSON.stringify(voted.data));
  assert.deepEqual(voted.data.poll.myChoices, [0, 2]);
  assert.deepEqual(voted.data.poll.options.map((o) => o.votes), [1, 0, 1]);
  assert.equal(voted.data.read, true, "voter, c'est avoir lu");
  await vote(bob.token, [0]);
  await vote(alice.token, [1]);
  const after = (await letterOf(alice.token)).poll;
  assert.deepEqual(after.options.map((o) => o.votes), [1, 1, 0], "le nouveau vote remplace l'ancien");
  assert.equal(after.voters, 2);

  const closed = await api.request("POST", `/api/admin/mail/${id}/close`, { token: owner });
  assert.equal(closed.data.poll.closed, true);
  assert.equal((await vote(bob.token, [2])).status, 409);
  const final = (await letterOf((await api.newPlayer()).token)).poll;
  assert.deepEqual(final.options.map((o) => o.votes), [1, 1, 0], "fermé : tout le monde voit les résultats");
});

test("sondage à une case et votes Discord : un compte lié vote comme son profil, une seule fois", async () => {
  const sent = await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Pick one", body: "x", kind: "poll", options: ["Yes", "No"] } });
  const id = sent.data.id;
  const linked = await api.newPlayer();
  await api.request("PATCH", "/api/players/me", { token: linked.token, body: { name: "Linked Climber", discordTag: "linkedclimber" } });
  assert.equal((await api.request("POST", `/api/mail/${id}/vote`, { token: linked.token, body: { choices: [0, 1] } })).status, 400, "une seule case");
  await api.request("POST", `/api/mail/${id}/vote`, { token: linked.token, body: { choices: [0] } });

  // Le même joueur sur Discord change d'avis : toujours un seul votant
  const fromDiscord = mail.voteFromDiscord(id, { id: "42", username: "linkedclimber", discriminator: "0" }, 1);
  assert.deepEqual(fromDiscord.poll.myChoices, [1]);
  assert.equal(fromDiscord.poll.voters, 1);
  // Un compte Discord sans profil compte à part
  const stranger = mail.voteFromDiscord(id, { id: "77", username: "stranger", discriminator: "0" }, 0);
  assert.equal(stranger.poll.voters, 2);
  assert.deepEqual(stranger.poll.options.map((o) => o.votes), [1, 1]);
});

test("sondage à plusieurs cases sur Discord : un bouton coche ou décoche", () => {
  const letter = mailRepo.insert({ kind: "poll", title: "Many", body: "x", playerId: null, authorId: null, multiple: true, at: new Date().toISOString() }, ["A", "B"]);
  const user = { id: "88", username: "nobody-here", discriminator: "0" };
  mail.voteFromDiscord(letter.id, user, 0);
  assert.deepEqual(mail.voteFromDiscord(letter.id, user, 1).poll.myChoices, [0, 1]);
  assert.deepEqual(mail.voteFromDiscord(letter.id, user, 0).poll.myChoices, [1]);
  const removed = mail.voteFromDiscord(letter.id, user, 1).poll;
  assert.deepEqual(removed.myChoices, []);
  assert.equal(mail.pollView(mailRepo.find(letter.id), null, { all: true }).voters, 0);
});

test("réponses personnelles : à l'auteur d'un report, lettre automatique une seule fois quand il est corrigé", async () => {
  const reports = require("../src/services/reports");
  const alice = await api.newPlayer();
  const bob = await api.newPlayer();
  const created = await api.request("POST", "/api/reports", { token: alice.token, body: { bugType: "Other", description: "The kevin block has the wrong colour", elementName: "kevin" } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.id;

  assert.equal((await api.request("POST", `/api/admin/reports/${id}/reply`, { token: bob.token, body: { body: "Hi" } })).status, 403);
  assert.equal((await api.request("POST", `/api/admin/reports/${id}/reply`, { token: owner, body: { body: " " } })).status, 400);
  const reply = await api.request("POST", `/api/admin/reports/${id}/reply`, { token: owner, body: { body: "Thanks, looking into it!" } });
  assert.equal(reply.status, 201, JSON.stringify(reply.data));
  assert.match(reply.data.title, /About your bug report on kevin/i);

  const lettersOf = async (token) => (await api.request("GET", "/api/mail", { token })).data.letters.filter((l) => l.kind === "reply");
  assert.equal((await lettersOf(alice.token)).length, 1);
  assert.equal((await lettersOf(bob.token)).length, 0, "personne d'autre ne la voit");

  // Corrigé (depuis l'admin, puis à nouveau depuis Discord) : une seule lettre automatique
  await api.request("PATCH", `/api/admin/reports/${id}`, { token: owner, body: { status: "fixed" } });
  reports.setStatus(id, "working", "discord-private");
  reports.setStatus(id, "fixed", "discord-private");
  const mine = await lettersOf(alice.token);
  const fixed = mine.filter((l) => l.title === "Your bug report is fixed!");
  assert.equal(fixed.length, 1);
  assert.match(fixed[0].body, /\*\*kevin\*\*/);
  assert.match(fixed[0].body, /wrong colour/);

  const listed = (await api.request("GET", "/api/admin/reports", { token: owner })).data.reports.find((r) => r.id === id);
  assert.deepEqual(listed.replies.map((r) => r.auto), [false, true]);

  // Report sans profil : personne à qui répondre, et pas de lettre automatique
  const anonymous = await api.request("POST", "/api/reports", { body: { bugType: "Other", description: "No profile here" } });
  assert.equal((await api.request("POST", `/api/admin/reports/${anonymous.data.id}/reply`, { token: owner, body: { body: "Hi" } })).status, 409);
  assert.equal(reports.setStatus(anonymous.data.id, "fixed").status, "fixed");
});

test("réponses personnelles : à l'auteur d'une suggestion de tag", async () => {
  const author = await api.newPlayer();
  await api.request("PUT", `/api/admin/players/${author.player.id}/playtester`, { token: owner, body: { enabled: true } });
  const suggested = await api.request("POST", "/api/connections/tag-suggestions", { token: author.token, body: { label: "Shiny things", elements: "gem, key", note: "" } });
  assert.equal(suggested.status, 201, JSON.stringify(suggested.data));
  const sent = await api.request("POST", `/api/admin/connections/suggestions/${suggested.data.id}/reply`, { token: owner, body: { body: "Great idea, added!" } });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.title, 'About your tag idea "Shiny things"');
  const listed = (await api.request("GET", "/api/admin/connections/suggestions", { token: owner })).data.find((s) => s.id === suggested.data.id);
  assert.equal(listed.hasAuthor, true);
  assert.equal(listed.replies.length, 1);
  const letters = (await api.request("GET", "/api/mail", { token: author.token })).data.letters;
  assert.ok(letters.some((l) => l.kind === "reply" && l.personal && l.body === "Great idea, added!"));

  // Devenue un tag : lettre automatique (une fois) ; écartée : rien
  const deleted = await api.request("DELETE", `/api/admin/connections/suggestions/${suggested.data.id}?added=${encodeURIComponent("Shiny")}`, { token: owner });
  assert.equal(deleted.status, 204);
  const added = (await api.request("GET", "/api/mail", { token: author.token })).data.letters.filter((l) => l.title === "Your tag idea is in the game!");
  assert.equal(added.length, 1);
  assert.match(added[0].body, /\*\*Shiny things\*\*.*as \*\*Shiny\*\*/);

  const other = await api.request("POST", "/api/connections/tag-suggestions", { token: author.token, body: { label: "Loud things", elements: "", note: "" } });
  await api.request("DELETE", `/api/admin/connections/suggestions/${other.data.id}`, { token: owner });
  const after = (await api.request("GET", "/api/mail", { token: author.token })).data.letters.filter((l) => l.kind === "reply");
  assert.equal(after.length, 2, "écartée : pas de lettre");
});

test("sondage : réponse « Other » et commentaire, lus par l'équipe sans nom, sur le site comme sur Discord", async () => {
  const sent = await api.request("POST", "/api/admin/mail", {
    token: owner,
    body: { title: "Next game?", body: "x", kind: "poll", options: ["Quiz", "Puzzle"], allowOther: true, allowComments: true }
  });
  const id = sent.data.id;
  const alice = await api.newPlayer();
  const vote = (token, body) => api.request("POST", `/api/mail/${id}/vote`, { token, body });

  assert.equal((await vote(alice.token, { choices: [mail.OTHER] })).status, 400, "Other sans texte");
  assert.equal((await vote(alice.token, { choices: [0], comment: "x".repeat(301) })).status, 400);
  const voted = await vote(alice.token, { choices: [mail.OTHER], other: "A rhythm game", comment: "Love the mailbox!" });
  assert.equal(voted.status, 200, JSON.stringify(voted.data));
  assert.equal(voted.data.poll.myOther, "A rhythm game");
  assert.equal(voted.data.poll.myComment, "Love the mailbox!");
  assert.deepEqual(voted.data.poll.options.map((o) => [o.label, o.votes]), [["Quiz", 0], ["Puzzle", 0], ["Other", 1]]);

  // Changer pour une vraie réponse efface le texte « Other » ; le commentaire reste s'il est renvoyé
  const changed = await vote(alice.token, { choices: [1], comment: "Love the mailbox!" });
  assert.equal(changed.data.poll.myOther, null);

  // Discord : un compte sans profil, par les fenêtres « Other… » et « Comment »
  const user = { id: "321", username: "discord-only", discriminator: "0" };
  const other = mail.otherFromDiscord(id, user, "A racing game");
  assert.deepEqual(other.poll.myChoices, [mail.OTHER]);
  mail.commentFromDiscord(id, user, "More polls please");
  assert.equal(mail.discordText(id, user, "comment"), "More polls please");
  // Un bouton de réponse (une seule case) remplace « Other » et efface son texte
  mail.voteFromDiscord(id, user, 0);
  assert.equal(mail.discordText(id, user, "other"), null);
  assert.equal(mail.discordText(id, user, "comment"), "More polls please", "le commentaire reste");

  const listed = (await api.request("GET", "/api/admin/mail", { token: owner })).data.letters.find((l) => l.id === id);
  assert.deepEqual(listed.texts.map((t) => t.kind).sort(), ["comment", "comment"]);
  assert.ok(listed.texts.some((t) => t.text === "Love the mailbox!"));
  assert.ok(listed.texts.every((t) => !("voter" in t)), "sans nom");

  // Sondage sans ces options : refusé
  const plain = await api.request("POST", "/api/admin/mail", { token: owner, body: { title: "Plain", body: "x", kind: "poll", options: ["A", "B"] } });
  assert.equal((await vote(alice.token, { choices: [mail.OTHER], other: "Hi" })).status === 200, true);
  assert.equal((await api.request("POST", `/api/mail/${plain.data.id}/vote`, { token: alice.token, body: { choices: [mail.OTHER], other: "Hi" } })).status, 400);
  assert.throws(() => mail.commentFromDiscord(plain.data.id, user, "hi"), /no comments/);
});
