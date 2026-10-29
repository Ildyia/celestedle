process.env.CONNECTIONS_ACCESS = "public";
require("./support/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const staff = require("../src/services/staff");

test("CONNECTIONS_ACCESS : accès par défaut tant que l'admin n'a rien réglé", () => {
  assert.equal(staff.connectionsAccess(), "public");
  assert.equal(staff.canPlaytest(null), true);
  staff.setConnectionsAccess("staff");
  assert.equal(staff.connectionsAccess(), "staff", "le réglage de l'admin l'emporte");
});
