const { writeLegacyFiles } = require("./support/env");

writeLegacyFiles({
  reports: {
    "BUG-OLD1": {
      votes: { "web-abc": 1, "123456789": 1 },
      elementName: "spring",
      bugType: "Error in hints",
      description: "The spring colour looks wrong to me",
      status: "🟡 Working on it",
      publicMessageId: "111"
    }
  },
  history: [
    { date: "2026-10-01", secretWord: "spring", victories: 12, avgTries: 4.5, avgHints: 0.5, avgTimeInSeconds: 90 }
  ]
});

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const daily = require("../src/services/daily");
const elementsRepo = require("../src/repositories/elements");
const { MODES, findInconsistency } = require("../src/services/modes");
const { verdictFor } = require("../src/services/compare");
const { startServer } = require("./support/http");

let api;
test.before(async () => {
  api = await startServer();
});
test.after(() => api.close());

// Profil propriétaire, créé une fois avec le mot de passe admin de test
let owner = null;
async function ownerHeaders() {
  if (!owner) {
    owner = await api.newPlayer();
    const claim = await api.request("POST", "/api/admin/claim-owner", {
      token: owner.token,
      body: { password: "test-admin-password" }
    });
    assert.equal(claim.status, 200, JSON.stringify(claim.data));
  }
  return { "X-Player-Token": owner.token };
}

function wrongGuessFor(secretName, exclude = []) {
  const all = db.prepare("SELECT name FROM elements WHERE is_active = 1 ORDER BY name").all();
  return all.map((r) => r.name).find((n) => n !== secretName && !exclude.includes(n));
}

test("version et santé", async () => {
  const { status, data } = await api.request("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(data.status, "ok");
});

test("une partie normale : essai, doublon, victoire, puis partie terminée", async () => {
  const { token } = await api.newPlayer();
  const secret = daily.getTodaySecret("normal").element.nom;
  const wrong = wrongGuessFor(secret);

  const empty = await api.request("GET", "/api/game?mode=normal", { token });
  assert.equal(empty.data.guesses.length, 0);
  assert.equal(empty.data.solution, null);

  const noToken = await api.request("POST", "/api/game/guess", { body: { mode: "normal", guess: wrong } });
  assert.equal(noToken.status, 401);

  const first = await api.request("POST", "/api/game/guess", { token, body: { mode: "normal", guess: wrong } });
  assert.equal(first.status, 200);
  assert.equal(first.data.state.tries, 1);
  assert.equal(first.data.state.solution, null, "la réponse n'est pas envoyée pendant la partie");

  const duplicate = await api.request("POST", "/api/game/guess", { token, body: { mode: "normal", guess: wrong.toUpperCase() } });
  assert.equal(duplicate.status, 409);

  const unknown = await api.request("POST", "/api/game/guess", { token, body: { mode: "normal", guess: "not a celeste thing" } });
  assert.equal(unknown.status, 400);

  const win = await api.request("POST", "/api/game/guess", { token, body: { mode: "normal", guess: secret } });
  assert.equal(win.data.state.status, "won");
  assert.equal(win.data.state.solution.nom, secret);

  const after = await api.request("POST", "/api/game/guess", { token, body: { mode: "normal", guess: wrongGuessFor(secret, [wrong]) } });
  assert.equal(after.status, 409);

  const stats = await api.request("GET", "/api/stats/today?mode=normal");
  assert.equal(stats.data.wins, 1);
  assert.equal(stats.data.avgTries, 2);
});

test("les synonymes officiels sont acceptés", async () => {
  const { token } = await api.newPlayer();
  const res = await api.request("POST", "/api/game/guess", { token, body: { mode: "normal", guess: "Red Bubble" } });
  assert.equal(res.status, 200);
  assert.equal(res.data.guess.nom, "red booster");
});

test("indices : un de chaque type en normal, un seul en Hard", async () => {
  const { token } = await api.newPlayer();
  const opposite = await api.request("POST", "/api/game/hint", { token, body: { mode: "normal", type: "opposite" } });
  assert.equal(opposite.status, 200);
  assert.equal(opposite.data.hints[0].type, "opposite");
  const again = await api.request("POST", "/api/game/hint", { token, body: { mode: "normal", type: "opposite" } });
  assert.equal(again.status, 409);
  const other = await api.request("POST", "/api/game/hint", { token, body: { mode: "normal", type: "secret_info" } });
  assert.equal(other.status, 200);

  const hard1 = await api.request("POST", "/api/game/hint", { token, body: { mode: "hard", type: "secret_info" } });
  assert.equal(hard1.status, 200);
  const hard2 = await api.request("POST", "/api/game/hint", { token, body: { mode: "hard", type: "opposite" } });
  assert.equal(hard2.status, 409);
  assert.match(hard2.data.error, /No hints left/);
});

test("mode Hard : un essai incohérent est refusé et ne compte pas", async () => {
  const { token } = await api.newPlayer();
  const secret = daily.getTodaySecret("hard").element;
  const first = elementsRepo.findByName(wrongGuessFor(secret.nom));
  await api.request("POST", "/api/game/guess", { token, body: { mode: "hard", guess: first.nom } });

  // Un élément qui ne peut pas être la réponse au vu du premier essai
  const history = [{ element: first, verdict: verdictFor(first, secret) }];
  const inconsistent = elementsRepo
    .listActive()
    .find((el) => el.id !== first.id && findInconsistency(el, history));
  const res = await api.request("POST", "/api/game/guess", { token, body: { mode: "hard", guess: inconsistent.nom } });
  assert.equal(res.status, 422);
  assert.ok(res.data.error.length > 0);

  const state = await api.request("GET", "/api/game?mode=hard", { token });
  assert.equal(state.data.tries, 1);
});

test("mode Hard : la partie est perdue au 8e essai faux", async () => {
  const { token } = await api.newPlayer();
  const secret = daily.getTodaySecret("hard").element;
  // La règle de cohérence est testée à part : on la coupe pour enchaîner 8 essais
  MODES.hard.consistentGuesses = false;
  try {
    let state;
    const names = elementsRepo.listActive().map((e) => e.nom).filter((n) => n !== secret.nom);
    for (const name of names.slice(0, 8)) {
      ({ data: { state } } = await api.request("POST", "/api/game/guess", { token, body: { mode: "hard", guess: name } }));
    }
    assert.equal(state.status, "lost");
    assert.equal(state.tries, 8);
    assert.equal(state.triesLeft, 0);
    assert.equal(state.solution.nom, secret.nom);
  } finally {
    MODES.hard.consistentGuesses = true;
  }
});

test("mode Hard : la partie est perdue quand le temps est écoulé", async () => {
  const { token, player } = await api.newPlayer();
  const secret = daily.getTodaySecret("hard").element;
  await api.request("POST", "/api/game/guess", { token, body: { mode: "hard", guess: wrongGuessFor(secret.nom) } });

  db.prepare("UPDATE games SET started_at = ? WHERE player_id = ? AND mode = 'hard'")
    .run(new Date(Date.now() - 6 * 60 * 1000).toISOString(), player.id);
  const state = await api.request("GET", "/api/game?mode=hard", { token });
  assert.equal(state.data.status, "lost");
  assert.equal(state.data.solution.nom, secret.nom);
});

test("mode Hard : une partie expirée compte comme perdue sans que le joueur revienne", async () => {
  const { token, player } = await api.newPlayer();
  const secret = daily.getTodaySecret("hard").element;
  await api.request("POST", "/api/game/guess", { token, body: { mode: "hard", guess: wrongGuessFor(secret.nom) } });
  const started = new Date(Date.now() - 10 * 60 * 1000);
  db.prepare("UPDATE games SET started_at = ? WHERE player_id = ? AND mode = 'hard'")
    .run(started.toISOString(), player.id);

  require("../src/services/games").expireOverdueGames();
  const game = db.prepare("SELECT * FROM game_summaries WHERE player_id = ? AND mode = 'hard'").get(player.id);
  assert.equal(game.status, "lost");
  assert.equal(game.seconds, 300);
});

test("abandon : la réponse est révélée et la partie est close", async () => {
  const { token } = await api.newPlayer();
  const res = await api.request("POST", "/api/game/forfeit", { token, body: { mode: "normal" } });
  assert.equal(res.data.status, "forfeit");
  assert.equal(res.data.solution.nom, daily.getTodaySecret("normal").element.nom);
  const again = await api.request("POST", "/api/game/forfeit", { token, body: { mode: "normal" } });
  assert.equal(again.status, 409);
});

test("changement de mot par l'admin : la partie repart de zéro", async () => {
  const { token } = await api.newPlayer();
  const secret = daily.getTodaySecret("normal").element.nom;
  await api.request("POST", "/api/game/guess", { token, body: { mode: "normal", guess: wrongGuessFor(secret) } });
  daily.drawRandomSecret("normal");
  const state = await api.request("GET", "/api/game?mode=normal", { token });
  assert.equal(state.data.reset, true);
  assert.equal(state.data.guesses.length, 0);
});

test("profil : modification, validation et masquage du classement", async () => {
  const { token } = await api.newPlayer();
  const bad = await api.request("PATCH", "/api/players/me", { token, body: { name: "<b>x</b>" } });
  assert.equal(bad.status, 400);

  const ok = await api.request("PATCH", "/api/players/me", { token, body: { name: "Madeline Main", avatar: "badeline" } });
  assert.equal(ok.data.player.name, "Madeline Main");

  const secret = daily.getTodaySecret("normal").element.nom;
  await api.request("POST", "/api/game/guess", { token, body: { mode: "normal", guess: secret } });

  let board = await api.request("GET", "/api/leaderboard?period=daily&mode=normal", { token });
  assert.ok(board.data.top.some((e) => e.player.name === "Madeline Main"));
  assert.equal(board.data.me.isMe, true);

  const weekly = await api.request("GET", "/api/leaderboard?period=weekly&mode=normal", { token });
  assert.equal(weekly.data.me.points, 10);

  await api.request("PATCH", "/api/players/me", { token, body: { isHidden: true } });
  board = await api.request("GET", "/api/leaderboard?period=daily&mode=normal", { token });
  assert.ok(!board.data.top.some((e) => e.player.name === "Madeline Main"));

  const stats = await api.request("GET", "/api/players/me/stats?mode=normal", { token });
  assert.equal(stats.data.wins, 1);
  assert.equal(stats.data.streak.current, 1);
  assert.equal(stats.data.distribution[0].count, 1);
});

test("reports : import v1, doublons, création et votes", async () => {
  const { token } = await api.newPlayer();

  const list = await api.request("GET", "/api/reports", { token });
  const old = list.data.reports.find((r) => r.id === "BUG-OLD1");
  assert.equal(old.status, "working");
  assert.equal(old.score, 2);

  const similar = await api.request("POST", "/api/reports/similar", {
    body: { elementName: "spring", description: "spring has the wrong colour" }
  });
  assert.equal(similar.data[0].id, "BUG-OLD1");

  const tooLong = await api.request("POST", "/api/reports", { body: { description: "x".repeat(1001) } });
  assert.equal(tooLong.status, 400);

  const created = await api.request("POST", "/api/reports", {
    body: { elementName: "spring", bugType: "Technical Bug", description: "<img src=x onerror=alert(1)>" }
  });
  assert.equal(created.status, 201);
  assert.match(created.data.id, /^BUG-[0-9A-F]{6}$/);

  const up = await api.request("POST", `/api/reports/${created.data.id}/vote`, { token, body: { isUp: true } });
  assert.equal(up.data.score, 1);
  assert.equal(up.data.userVote, 1);
  const cancel = await api.request("POST", `/api/reports/${created.data.id}/vote`, { token, body: { isUp: true } });
  assert.equal(cancel.data.score, 0);
  const down = await api.request("POST", `/api/reports/${created.data.id}/vote`, { token, body: { isUp: false } });
  assert.equal(down.data.score, -1);
});

test("reports spoiler : élément masqué tant qu'il est le mot du jour", async () => {
  const { token } = await api.newPlayer();
  const secret = daily.getTodaySecret("normal").element.nom;
  const created = await api.request("POST", "/api/reports", {
    token,
    body: { elementName: secret, description: "Spoiler about the answer", isSpoiler: true }
  });
  const general = await api.request("POST", "/api/reports", {
    body: { description: "General spoiler posted today", isSpoiler: true }
  });

  const find = async (id) => (await api.request("GET", "/api/reports", { token })).data.reports.find((r) => r.id === id);
  const hidden = await find(created.data.id);
  assert.equal(hidden.isSpoiler, true);
  assert.equal(hidden.elementName, null);
  assert.equal(hidden.elementId, null);
  assert.equal((await find(general.data.id)).isSpoiler, true);

  // La recherche de doublons ne doit pas trahir la réponse par l'élément
  const similar = await api.request("POST", "/api/reports/similar", { body: { elementName: secret, description: "" } });
  assert.ok(similar.data.every((r) => r.id !== created.data.id));

  const vote = await api.request("POST", `/api/reports/${created.data.id}/vote`, { token, body: { isUp: true } });
  assert.equal(vote.data.elementName, null);

  // Le mot du jour change : le spoiler est levé
  daily.setSecret("normal", elementsRepo.findByName(wrongGuessFor(secret)));
  const hard = daily.getTodaySecret("hard").element.nom;
  if (hard === secret) daily.setSecret("hard", elementsRepo.findByName(wrongGuessFor(secret, [secret])));
  const revealed = await find(created.data.id);
  assert.equal(revealed.isSpoiler, false);
  assert.equal(revealed.elementName, secret);
});

test("admin : accès par le profil, propriétaire désigné une seule fois", async () => {
  const noToken = await api.request("GET", "/api/admin/overview");
  assert.equal(noToken.status, 401);

  const { token } = await api.newPlayer();
  const noRights = await api.request("GET", "/api/admin/overview", { token });
  assert.equal(noRights.status, 403);
  const me = await api.request("GET", "/api/admin/me", { token });
  assert.deepEqual([me.data.role, me.data.quota], ["player", null]);

  const wrong = await api.request("POST", "/api/admin/claim-owner", { token, body: { password: "nope" } });
  assert.equal(wrong.status, 401);

  await ownerHeaders();
  const second = await api.request("POST", "/api/admin/claim-owner", { token, body: { password: "test-admin-password" } });
  assert.equal(second.status, 409);
  const ownerMe = await api.request("GET", "/api/admin/me", { token: owner.token });
  assert.equal(ownerMe.data.role, "owner");
  assert.equal(ownerMe.data.quota.limit, null);
  assert.equal(ownerMe.data.ownerClaimable, false);
});

test("admin : tableau de bord, éditeur et réglages", async () => {
  const headers = await ownerHeaders();

  const overview = await api.request("GET", "/api/admin/overview", { headers });
  assert.ok(overview.data.modes.normal.secret.nom);
  assert.ok(overview.data.modes.hard.stats.players >= 1);

  const history = await api.request("GET", "/api/admin/history", { headers });
  assert.equal(history.data.legacy[0].word, "spring");

  const words = await api.request("GET", "/api/admin/words", { headers });
  assert.ok(words.data.find((w) => w.name === "spring").legacyWins >= 12);

  const set = await api.request("POST", "/api/admin/secret", { headers, body: { mode: "hard", action: "set", elementName: "feather" } });
  assert.equal(set.data.nom, "feather");

  const { data: { elements } } = await api.request("GET", "/api/admin/elements", { headers });
  const spring = elements.find((e) => e.nom === "spring");
  const edited = await api.request("PATCH", `/api/admin/elements/${spring.id}`, {
    headers,
    body: { couleur: ["brown", "grey"] }
  });
  assert.deepEqual(edited.data.couleur, ["brown", "grey"]);
  assert.equal(edited.data.managedBy, "admin");

  const invalid = await api.request("PATCH", `/api/admin/elements/${spring.id}`, { headers, body: { couleur: ["plaid"] } });
  assert.equal(invalid.status, 400);

  const exported = await api.request("GET", "/api/admin/export/db.json", { headers });
  assert.deepEqual(exported.data.spring.couleur, ["brown", "grey"]);

  const settings = await api.request("PUT", "/api/admin/settings", { headers, body: { repeatDelayDays: 0 } });
  assert.equal(settings.data.repeatDelayDays, 0);
});

test("admin : les règles du mode Hard sont réglables et appliquées", async () => {
  const headers = await ownerHeaders();

  const invalid = await api.request("PUT", "/api/admin/settings", { headers, body: { modes: { hard: { maxHints: 9 } } } });
  assert.equal(invalid.status, 400);
  const notAdjustable = await api.request("PUT", "/api/admin/settings", { headers, body: { modes: { normal: { maxTries: 3 } } } });
  assert.equal(notAdjustable.status, 400);

  const saved = await api.request("PUT", "/api/admin/settings", {
    headers,
    body: { modes: { hard: { maxHints: 2, maxTries: 0, timeLimitSeconds: 600, suggestionMinChars: 5 } } }
  });
  assert.deepEqual(
    [saved.data.modes.hard.maxHints, saved.data.modes.hard.maxTries, saved.data.modes.hard.timeLimitSeconds],
    [2, null, 600]
  );

  const publicRules = await api.request("GET", "/api/modes");
  assert.equal(publicRules.data.hard.suggestionMinChars, 5);

  const { token } = await api.newPlayer();
  const state = await api.request("GET", "/api/game?mode=hard", { token });
  assert.equal(state.data.rules.maxHints, 2);
  assert.equal(state.data.triesLeft, null);
  const first = await api.request("POST", "/api/game/hint", { token, body: { mode: "hard", type: "opposite" } });
  const second = await api.request("POST", "/api/game/hint", { token, body: { mode: "hard", type: "secret_info" } });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  // Retour aux valeurs par défaut pour les autres tests
  await api.request("PUT", "/api/admin/settings", {
    headers,
    body: { modes: { hard: { maxHints: 1, maxTries: 8, timeLimitSeconds: 300, suggestionMinChars: 4 } } }
  });
});

test("profil : tag Discord facultatif, validé et privé", async () => {
  const { token } = await api.newPlayer();
  const bad = await api.request("PATCH", "/api/players/me", { token, body: { discordTag: "no spaces allowed" } });
  assert.equal(bad.status, 400);

  const ok = await api.request("PATCH", "/api/players/me", { token, body: { discordTag: "@Madeline_Climbs" } });
  assert.equal(ok.data.player.discordTag, "madeline_climbs");
  const legacy = await api.request("PATCH", "/api/players/me", { token, body: { discordTag: "Madeline#1234" } });
  assert.equal(legacy.data.player.discordTag, "Madeline#1234");

  const unchanged = await api.request("PATCH", "/api/players/me", { token, body: { name: "Tag Keeper" } });
  assert.equal(unchanged.data.player.discordTag, "Madeline#1234");
  const cleared = await api.request("PATCH", "/api/players/me", { token, body: { discordTag: "" } });
  assert.equal(cleared.data.player.discordTag, null);
});

test("admin : auteur des reports, tri, suppression et purge des reports clos", async () => {
  const headers = await ownerHeaders();

  const { token } = await api.newPlayer();
  await api.request("PATCH", "/api/players/me", { token, body: { name: "Reporter", discordTag: "reporter_one" } });
  const mine = await api.request("POST", "/api/reports", { token, body: { description: "Report with an author" } });
  const anonymous = await api.request("POST", "/api/reports", { body: { description: "Report without author" } });

  // L'auteur n'apparaît jamais côté joueurs
  const publicList = await api.request("GET", "/api/reports");
  const publicMine = publicList.data.reports.find((r) => r.id === mine.data.id);
  assert.equal(publicMine.reporter, undefined);
  assert.equal(JSON.stringify(publicList.data).includes("reporter_one"), false);

  const adminList = await api.request("GET", "/api/admin/reports", { headers });
  const adminMine = adminList.data.reports.find((r) => r.id === mine.data.id);
  assert.deepEqual([adminMine.reporter.name, adminMine.reporter.discordTag], ["Reporter", "reporter_one"]);
  assert.equal(adminList.data.reports.find((r) => r.id === anonymous.data.id).reporter, null);

  const deleted = await api.request("DELETE", `/api/admin/reports/${anonymous.data.id}`, { headers });
  assert.equal(deleted.status, 204);
  const missing = await api.request("DELETE", `/api/admin/reports/${anonymous.data.id}`, { headers });
  assert.equal(missing.status, 404);

  await api.request("PATCH", `/api/admin/reports/${mine.data.id}`, { headers, body: { status: "fixed" } });
  const purge = await api.request("POST", "/api/admin/reports/purge-closed", { headers });
  assert.ok(purge.data.deleted >= 1);
  const after = await api.request("GET", "/api/admin/reports", { headers });
  assert.ok(after.data.reports.every((r) => ["new", "working"].includes(r.status)));
});

test("rôles : le propriétaire gère l'équipe, l'administrateur a un quota", async () => {
  const headers = await ownerHeaders();
  const helper = await api.newPlayer();
  const adminHeaders = { "X-Player-Token": helper.token };

  const unknown = await api.request("POST", "/api/admin/team", { headers, body: { playerId: "nobody" } });
  assert.equal(unknown.status, 404);
  const granted = await api.request("POST", "/api/admin/team", { headers, body: { playerId: helper.player.id } });
  assert.equal(granted.data.role, "administrator");

  // L'administrateur consulte, mais ne gère pas l'équipe
  assert.equal((await api.request("GET", "/api/admin/overview", { headers: adminHeaders })).status, 200);
  assert.equal((await api.request("GET", "/api/admin/team", { headers: adminHeaders })).status, 403);
  const selfGrant = await api.request("POST", "/api/admin/team", { headers: adminHeaders, body: { playerId: helper.player.id } });
  assert.equal(selfGrant.status, 403);
  const limitChange = await api.request("PUT", "/api/admin/settings", { headers: adminHeaders, body: { adminDailyLimit: 999 } });
  assert.equal(limitChange.status, 403);

  // Quota de 2 modifications : une requête refusée ne compte pas
  await api.request("PUT", "/api/admin/settings", { headers, body: { adminDailyLimit: 2 } });
  const report = await api.request("POST", "/api/reports", { body: { description: "Quota test report" } });
  const statusOf = (status) =>
    api.request("PATCH", `/api/admin/reports/${report.data.id}`, { headers: adminHeaders, body: { status } });
  assert.equal((await statusOf("not-a-status")).status, 400);
  assert.equal((await statusOf("working")).status, 200);
  assert.equal((await statusOf("new")).status, 200);
  const blocked = await statusOf("working");
  assert.equal(blocked.status, 429);
  const quota = await api.request("GET", "/api/admin/me", { headers: adminHeaders });
  assert.deepEqual([quota.data.quota.used, quota.data.quota.remaining], [2, 0]);

  // Le propriétaire n'a pas de limite
  assert.equal((await api.request("PATCH", `/api/admin/reports/${report.data.id}`, { headers, body: { status: "fixed" } })).status, 200);

  const audit = await api.request("GET", "/api/admin/audit", { headers });
  const actions = audit.data.map((a) => a.action);
  assert.ok(actions.includes("grant_admin") && actions.includes("report_status") && actions.includes("claim_owner"));

  const revoked = await api.request("DELETE", `/api/admin/team/${helper.player.id}`, { headers });
  assert.equal(revoked.data.role, "player");
  assert.equal((await api.request("GET", "/api/admin/overview", { headers: adminHeaders })).status, 403);
});

test("/passcode : nouveau code pour les profils au tag Discord de l'utilisateur", async () => {
  const players = require("../src/services/players");
  const lost = await api.newPlayer();
  await api.request("PATCH", "/api/players/me", { token: lost.token, body: { discordTag: "lost_climber" } });

  assert.deepEqual(players.findByDiscordUser({ username: "someone_else", discriminator: "0" }), []);
  const [match] = players.findByDiscordUser({ username: "Lost_Climber", discriminator: "0" });
  assert.equal(match.id, lost.player.id);

  const newCode = players.resetToken(match.id);
  assert.equal((await api.request("GET", "/api/players/me", { token: lost.token })).status, 401, "l'ancien code ne marche plus");
  const restored = await api.request("GET", "/api/players/me", { token: newCode });
  assert.equal(restored.data.player.id, lost.player.id);
});

test("suppression : par le joueur, ou par le propriétaire seulement", async () => {
  const headers = await ownerHeaders();

  // Le joueur supprime son profil : parties et votes partent, ses reports restent
  const leaving = await api.newPlayer();
  await api.request("POST", "/api/game/forfeit", { token: leaving.token, body: { mode: "normal" } });
  const report = await api.request("POST", "/api/reports", { token: leaving.token, body: { description: "Report from a leaving player" } });
  await api.request("POST", `/api/reports/${report.data.id}/vote`, { token: leaving.token, body: { isUp: true } });
  assert.equal((await api.request("DELETE", "/api/players/me", { token: leaving.token })).status, 204);
  assert.equal((await api.request("GET", "/api/players/me", { token: leaving.token })).status, 401);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM games WHERE player_id = ?").get(leaving.player.id).n, 0);
  const kept = (await api.request("GET", "/api/admin/reports", { headers })).data.reports.find((r) => r.id === report.data.id);
  assert.equal(kept.reporter, null);
  assert.equal(kept.score, 0);

  // Le propriétaire ne peut pas supprimer son propre profil
  assert.equal((await api.request("DELETE", "/api/players/me", { headers })).status, 409);

  // Recherche par tag Discord, puis suppression réservée au propriétaire
  const target = await api.newPlayer();
  await api.request("PATCH", "/api/players/me", { token: target.token, body: { discordTag: "to_delete" } });
  const found = await api.request("GET", "/api/admin/players?q=to_delete", { headers });
  assert.equal(found.data[0].id, target.player.id);

  const helper = await api.newPlayer();
  await api.request("POST", "/api/admin/team", { headers, body: { playerId: helper.player.id } });
  const byAdmin = await api.request("DELETE", `/api/admin/players/${target.player.id}`, { headers: { "X-Player-Token": helper.token } });
  assert.equal(byAdmin.status, 403);

  assert.equal((await api.request("DELETE", `/api/admin/players/${target.player.id}`, { headers })).status, 204);
  assert.equal((await api.request("GET", "/api/players/me", { token: target.token })).status, 401);
  const audit = await api.request("GET", "/api/admin/audit", { headers });
  assert.ok(audit.data.some((a) => a.action === "delete_player"));
});

test("sprites : image de l'élément, ou image par défaut", async () => {
  const sprite = await api.request("GET", "/sprite/summit%20gems");
  assert.equal(sprite.headers.get("content-type"), "image/png");
  const missing = await api.request("GET", "/sprite/nothing");
  assert.equal(missing.status, 200);
  assert.match(missing.headers.get("content-type"), /svg/);
});

test("CORS : domaines Celestedle acceptés, autres refusés", async () => {
  const ok = await api.request("GET", "/api/version", { headers: { Origin: "https://celestedle-beta.vercel.app" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://celestedle-beta.vercel.app");
  const ko = await api.request("GET", "/api/version", { headers: { Origin: "https://evil.vercel.app" } });
  assert.equal(ko.headers.get("access-control-allow-origin"), null);
});
