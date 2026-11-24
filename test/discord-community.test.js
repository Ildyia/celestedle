require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const players = require("../src/services/players");
const community = require("../src/services/discord-community");
const playerCard = require("../src/services/player-card");
const { profileEmbed } = require("../src/discord/profile-embed");
const { todayParis, addDays } = require("../src/utils/dates");

const today = todayParis();

function linked(name, discordTag, { isHidden = false } = {}) {
  const { player } = players.createPlayer();
  return players.updateProfile(player, { name, discordTag, isHidden });
}

function win(playerId, date, mode = "normal") {
  const elementId = db.prepare("SELECT id FROM elements ORDER BY id LIMIT 1").get().id;
  const at = new Date(`${date}T12:00:00Z`).toISOString();
  const { lastInsertRowid: id } = db
    .prepare("INSERT INTO games (date, mode, player_id, status, secret_version, started_at, finished_at) VALUES (?, ?, ?, 'won', 1, ?, ?)")
    .run(date, mode, playerId, at, at);
  db.prepare("INSERT INTO guesses (game_id, position, element_id, created_at) VALUES (?, 1, ?, ?)").run(id, elementId, at);
}

const user = (username, id = username) => ({ id, username, discriminator: "0" });

test("rappel : seulement pour un compte lié, à l'heure choisie, les jours où il n'a pas encore joué", () => {
  assert.throws(() => community.setReminder(user("nobody")), /No Celestedle profile/);
  const ana = linked("Ana Remind", "ana.remind");
  assert.throws(() => community.setReminder(user("ana.remind"), 25), /between 0 and 23/);
  community.setReminder(user("ana.remind", "111"), 20);
  assert.equal(community.findReminder(user("ana.remind", "111")).hour, 20);

  // Série de 2 jours (avant-hier, hier), pas encore joué aujourd'hui
  win(ana.id, addDays(today, -2));
  win(ana.id, addDays(today, -1));
  assert.deepEqual(community.reminderFor(user("ana.remind")), { streak: 2, name: "Ana Remind" });
  assert.match(community.reminderText({ streak: 2 }, "https://x.test/"), /2-day streak/);
  assert.match(community.reminderText({ streak: 0 }, "https://x.test/"), /waiting for you/);

  // 20 h à Paris : dû une fois, pas deux
  const eight = new Date(`${today}T19:30:00Z`); // 20:30 ou 21:30 à Paris selon la saison
  const parisHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(eight));
  community.setReminder(user("ana.remind", "111"), parisHour);
  assert.ok(community.dueReminders(eight).some((r) => r.userId === "111"));
  community.markReminderSent("111", eight);
  assert.ok(!community.dueReminders(eight).some((r) => r.userId === "111"));

  win(ana.id, today);
  assert.equal(community.reminderFor(user("ana.remind")), null, "déjà joué aujourd'hui");
  assert.equal(community.removeReminder(user("ana.remind", "111")), true);
  assert.equal(community.findReminder(user("ana.remind", "111")), null);
});

test("/profile : la fiche publique, jamais celle d'un profil caché", () => {
  const ben = linked("Ben Profile", "ben.profile");
  // Aujourd'hui : une victoire de la semaine passée le ferait champion (👑)
  win(ben.id, today);
  linked("Hidden Ben", "ben.profile", { isHidden: true });
  const visible = community.publicProfiles(user("ben.profile"));
  assert.deepEqual(visible.map((p) => p.name), ["Ben Profile"]);

  const embed = profileEmbed(playerCard.publicCard(visible[0]), "https://celestedle.example/");
  assert.equal(embed.title, "Ben Profile");
  assert.match(embed.description, /Forsaken City/, "une fraise : chapitre 1");
  assert.equal(embed.fields.find((f) => f.name === "Strawberries").value, "🍓 1");
  assert.match(embed.thumbnail.url, /^https:\/\/celestedle\.example\/assets\//);
  assert.match(embed.url, /index\.html\?player=/);

  // Seulement des profils cachés : pas de fiche du tout
  linked("Shy Climber", "shy.climber", { isHidden: true });
  assert.deepEqual(community.publicProfiles(user("shy.climber")), []);
});

test("rôles de chapitre : chapitre le plus haut de chaque nom Discord, anciens tags laissés de côté", () => {
  const cleo = linked("Cleo Roles", "cleo.roles");
  for (let d = 1; d <= 5; d++) win(cleo.id, addDays(today, -10 - d));
  linked("Cleo Alt", "cleo.roles");
  linked("Old Tag", "Oldie#1234");
  const chapters = community.chaptersByUsername();
  assert.equal(chapters.get("cleo.roles"), 2, "5 fraises : Old Site");
  assert.ok(![...chapters.keys()].some((k) => k.includes("#")));
  assert.equal(community.chapterOf(user("cleo.roles")), 2);
  assert.equal(community.chapterOf(user("ghost")), null);

  // Caché des classements : pas de rôle de chapitre (ceux qu'il a sont retirés)
  const dana = linked("Dana Hidden", "dana.hidden", { isHidden: true });
  win(dana.id, addDays(today, -20));
  assert.equal(community.chaptersByUsername().get("dana.hidden"), community.NO_ROLE);
  assert.equal(community.chapterOf(user("dana.hidden")), community.NO_ROLE);

  assert.equal(community.chapterRoles(), null);
  community.setChapterRoles("guild1", community.CHAPTERS.map((_, i) => `role${i}`));
  assert.equal(community.chapterRoles().roles[2], "role2");
});
