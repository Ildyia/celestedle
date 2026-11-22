// Sans réglage de l'admin ni variable d'environnement, Connections est ouvert à tous
process.env.CONNECTIONS_ACCESS = "";
require("./support/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const staff = require("../src/services/staff");

test("Connections : ouvert à tous par défaut, même sans profil", () => {
  assert.equal(staff.connectionsAccess(), "public");
  assert.equal(staff.canPlaytest(null), true);
});
