process.env.TECHS_ACCESS = "public";
require("./support/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const techs = require("../src/services/techs");
const techsRepo = require("../src/repositories/techs");
const { aliasesFromName } = require("../src/db/seed-techs");
const { startServer } = require("./support/http");

let api;
test.before(async () => {
  api = await startServer();
});
test.after(() => api.close());

const secretOf = (mode = "tech") => techs.daily.getTodaySecret(mode).element;
const otherThan = (secret, filter = () => true) => techsRepo.listActive().find((t) => t.id !== secret.id && filter(t));

test("techs.json : techs importées, synonymes tirés des noms", () => {
  assert.ok(techsRepo.count() >= 16);
  assert.deepEqual(aliasesFromName("Superdash (Super)").sort(), ["Super", "Superdash"]);
  assert.deepEqual(aliasesFromName("Jellyvator / Theovator").sort(), ["Jellyvator", "Theovator"]);
  assert.deepEqual(aliasesFromName("Extended Super/Hyper"), []);
  assert.equal(techsRepo.findByNameOrAlias("theovator").nom, "Jellyvator / Theovator");
});

test("techs.json v2 : techs ajoutées, champs jamais modifiés mis à jour, modifications de l'admin gardées", () => {
  const db = require("../src/db");
  const { seedTechs } = require("../src/db/seed-techs");
  // Base remplie avec la version 1, puis modifiée dans l'admin
  db.prepare("UPDATE settings SET value = '1' WHERE key = 'techs_seed_version'").run();
  db.prepare("DELETE FROM techs WHERE name = 'Archie'").run();
  db.prepare("UPDATE techs SET utility = 'Stamina Preservation', difficulty = 'Beginner' WHERE name = 'Climbhop'").run();
  db.prepare("UPDATE techs SET utility = 'My own value' WHERE name = 'Coyote Time'").run();
  db.prepare("UPDATE techs SET name = 'Demodash' WHERE name = 'Demodash (Demo)'").run();

  seedTechs(db);
  assert.ok(techsRepo.findByName("Archie"), "tech manquante ajoutée");
  const climbhop = techsRepo.findByName("Climbhop");
  assert.equal(climbhop.utility, "Leniency");
  assert.equal(climbhop.difficulty, "Passive");
  assert.equal(techsRepo.findByName("Coyote Time").utility, "My own value", "valeur de l'admin gardée");
  assert.equal(techsRepo.findByNameOrAlias("demo").nom, "Demodash (Demo)", "renommée, synonymes ajoutés");
  assert.equal(techsRepo.findByNameOrAlias("bhop").nom, "Bunnyhop (Bhop)");
  assert.ok(techsRepo.count() >= 90);
});

test("comparaison : la difficulté dit si la réponse est plus ou moins dure", () => {
  const { compareCategory } = techs.comparator;
  assert.equal(compareCategory("difficulty", "Beginner", "Advanced"), "higher");
  assert.equal(compareCategory("difficulty", "Expert", "Passive"), "lower");
  assert.equal(compareCategory("difficulty", "Expert", "TAS"), "higher");
  assert.equal(compareCategory("difficulty", "GM+", "GM"), "lower");
  assert.equal(compareCategory("difficulty", "Expert", "GM"), "higher");
  assert.equal(compareCategory("difficulty", "Intermediate", "intermediate"), "correct");
  assert.equal(compareCategory("category", "Dash Tech", "Mechanics"), "wrong");
});

test("partie de techs : essai, synonyme, doublon, victoire", async () => {
  const { token } = await api.newPlayer();
  const secret = secretOf();
  const wrong = otherThan(secret);

  const state = await api.request("GET", "/api/techs/game", { token });
  assert.equal(state.status, 200);
  assert.equal(state.data.mode, "tech");
  assert.equal(state.data.solution, null);

  const first = await api.request("POST", "/api/techs/guess", { token, body: { guess: wrong.nom } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.guess.verdict.isCorrect, false);
  assert.ok(["correct", "higher", "lower"].includes(first.data.guess.verdict.difficulty));
  assert.equal(first.data.guess.valeurs.category, wrong.category, "valeurs affichées telles qu'écrites");

  const again = await api.request("POST", "/api/techs/guess", { token, body: { guess: wrong.nom.toUpperCase() } });
  assert.equal(again.status, 409);
  assert.equal((await api.request("POST", "/api/techs/guess", { token, body: { guess: "Wallrun" } })).status, 400);

  const hint = await api.request("POST", "/api/techs/hint", { token, body: { type: "secret_info" } });
  assert.equal(hint.status, 200, JSON.stringify(hint.data));

  const win = await api.request("POST", "/api/techs/guess", { token, body: { guess: secret.aliases[0] ?? secret.nom } });
  assert.equal(win.data.state.status, "won");
  assert.equal(win.data.state.solution.nom, secret.nom);

  // Profil enregistré : classé dans le classement du jour des techs
  await api.request("PATCH", "/api/players/me", { token, body: { name: "Tech Climber" } });
  const board = await api.request("GET", "/api/leaderboard?period=daily&mode=tech", { token });
  assert.equal(board.status, 200);
  assert.ok(board.data.top.some((e) => e.isMe));
  const all = await api.request("GET", "/api/leaderboard?period=global", { token });
  assert.equal(all.data.me.games, 1, "compte dans le All time, avec les autres modes");

  const stats = await api.request("GET", "/api/techs/stats", { token });
  assert.ok(stats.data.wins >= 1);
});

test("techs Hard : sa propre tech, essai incohérent refusé, Info en bonus", async () => {
  const { token } = await api.newPlayer();
  const secret = secretOf("tech-hard");
  assert.notEqual(secret.id, secretOf().id, "pas la même tech qu'en normal");
  const body = (extra) => ({ token, body: { mode: "tech-hard", ...extra } });

  const first = otherThan(secret, (t) => t.category !== secret.category);
  await api.request("POST", "/api/techs/guess", body({ guess: first.nom }));
  // Même catégorie que le premier essai, déjà exclue : refusé sans verdict
  const sameCategory = techsRepo.listActive().find((t) => t.id !== first.id && t.id !== secret.id && t.category === first.category);
  if (sameCategory) {
    const refused = await api.request("POST", "/api/techs/guess", body({ guess: sameCategory.nom }));
    assert.equal(refused.data.guess, null);
    assert.ok(refused.data.rejected.message);
  }

  assert.equal((await api.request("POST", "/api/techs/hint", body({ type: "opposite" }))).status, 200);
  assert.equal((await api.request("POST", "/api/techs/hint", body({ type: "secret_info" }))).status, 409);
  const info = await api.request("POST", "/api/techs/hint", body({ type: "info", choice: first.nom }));
  assert.equal(info.status, 200, JSON.stringify(info.data));
  assert.equal(info.data.hints.find((h) => h.type === "info").values.utility, first.utility);

  // Partie Hard en cours : le mode normal des techs est bloqué
  assert.equal((await api.request("GET", "/api/techs/game", { token })).data.lockedBy, "tech-hard");
});

test("admin des techs : créer, modifier, image GIF, tech du jour, accès", async () => {
  const owner = await api.newPlayer();
  const claim = await api.request("POST", "/api/admin/claim-owner", { token: owner.token, body: { password: "test-admin-password" } });
  assert.equal(claim.status, 200);
  const token = owner.token;
  const { token: playerToken } = await api.newPlayer();
  assert.equal((await api.request("GET", "/api/admin/techs", { token: playerToken })).status, 403);

  const list = await api.request("GET", "/api/admin/techs", { token });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.difficulties.slice(-4), ["Expert", "GM", "GM+", "TAS"]);
  assert.ok(list.data.today.tech.secret.nom);

  const tech = { name: "Glider Super", category: "Entity Tech", difficulty: "advanced", utility: "Horizontal Speed", dash_required: "yes", hardcoded: "derived", aliases: "glidesuper, glider sup" };
  assert.equal((await api.request("POST", "/api/admin/techs", { token, body: { ...tech, difficulty: "Godlike" } })).status, 400);
  const created = await api.request("POST", "/api/admin/techs", { token, body: tech });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.difficulty, "Advanced");
  assert.deepEqual(created.data.aliases.sort(), ["glider sup", "glidesuper"]);
  assert.equal((await api.request("POST", "/api/admin/techs", { token, body: tech })).status, 409);

  const edited = await api.request("PATCH", `/api/admin/techs/${created.data.id}`, { token, body: { utility: "Dash Recovery", difficulty: "gm+" } });
  assert.equal(edited.data.utility, "Dash Recovery");
  assert.equal(edited.data.difficulty, "GM+");

  // GIF de 1 pixel
  const gif = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  const res = await fetch(`${api.base}/api/admin/techs/${created.data.id}/media`, {
    method: "POST",
    headers: { "Content-Type": "image/gif", "X-Player-Token": token },
    body: gif
  });
  const withMedia = await res.json();
  assert.equal(res.status, 200, JSON.stringify(withMedia));
  assert.match(withMedia.media, /^uploads\/glider-super-\w+\.gif$/);
  const served = await fetch(`${api.base}/tech-media/${encodeURIComponent("Glider Super")}`);
  assert.equal(Buffer.from(await served.arrayBuffer()).equals(gif), true);

  const imposed = await api.request("POST", "/api/admin/techs/secret", { token, body: { mode: "tech", action: "set", name: "glidesuper" } });
  assert.equal(imposed.data.tech.secret.nom, "Glider Super");
  assert.equal(imposed.data.tech.secret.source, "admin");

  const access = await api.request("PUT", "/api/admin/techs/access", { token, body: { access: "staff" } });
  assert.equal(access.data.access, "staff");
  assert.equal((await api.request("GET", "/api/techs/game", { token: playerToken })).status, 403);
  assert.equal((await api.request("GET", "/api/techs-access", { token: playerToken })).data.canPlay, false);
  assert.equal((await api.request("GET", "/api/techs/game", { token })).status, 200, "l'équipe joue toujours");
  await api.request("PUT", "/api/admin/techs/access", { token, body: { access: "public" } });
});
