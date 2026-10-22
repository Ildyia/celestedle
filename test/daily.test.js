require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const daily = require("../src/services/daily");
const elementsRepo = require("../src/repositories/elements");
const { todayParis, addDays } = require("../src/utils/dates");
const dbJson = require("../db.json");

// Tirage de la v1 (helpers.js avant la 2.0), sans seed
function legacyPick(date) {
  const list = Object.keys(dbJson).sort();
  let hash = 0;
  for (let i = 0; i < date.length; i++) hash = (hash * 33 + date.charCodeAt(i)) | 0;
  return list[(hash >>> 0) % list.length];
}

test("le premier jour garde le mot de l'ancien tirage", () => {
  assert.equal(daily.getTodaySecret("normal").element.nom, legacyPick(todayParis()));
});

test("le mot du mode Hard diffère du mot normal", () => {
  assert.notEqual(daily.getTodaySecret("hard").element_id, daily.getTodaySecret("normal").element_id);
});

test("un mot sorti récemment est sauté selon le délai réglé", () => {
  const today = todayParis();
  const tomorrow = addDays(today, 1);
  const todayId = daily.getTodaySecret("normal").element_id;

  // Le mot de demain selon l'ancien tirage est forcé hier : il doit être sauté
  const legacyTomorrow = elementsRepo.findByName(legacyPick(tomorrow));
  db.prepare("INSERT INTO daily_secrets (date, mode, element_id, source) VALUES (?, 'normal', ?, 'auto')")
    .run(addDays(today, -1), legacyTomorrow.id);

  daily.setRepeatDelay(2);
  const pick = daily.getSecretRow(tomorrow, "normal");
  assert.notEqual(pick.element_id, legacyTomorrow.id);
  assert.notEqual(pick.element_id, todayId);

  // Sans délai, le tirage de la v1 est repris tel quel
  db.prepare("DELETE FROM daily_secrets WHERE date = ?").run(tomorrow);
  daily.setRepeatDelay(0);
  assert.equal(daily.getSecretRow(tomorrow, "normal").element_id, legacyTomorrow.id);
});

test("ajouter un élément ne change pas le mot déjà tiré", () => {
  const before = daily.getTodaySecret("normal").element_id;
  elementsRepo.create({ name: "aaa test element", type: "hazards", shape: "round", lieu: ["core"], couleur: ["red"] });
  assert.equal(daily.getTodaySecret("normal").element_id, before);
});

test("un choix de l'admin remplace le mot et incrémente la version", () => {
  const before = daily.getTodaySecret("normal");
  const after = daily.drawRandomSecret("normal");
  assert.notEqual(after.element_id, before.element_id);
  assert.equal(after.version, before.version + 1);
  assert.equal(after.source, "admin");
});
