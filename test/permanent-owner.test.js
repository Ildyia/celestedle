process.env.PERMANENT_OWNER_TOKEN = "permanent-owner-token-for-tests";
require("./support/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const players = require("../src/services/players");
const { ensurePermanentOwner } = require("../src/services/permanent-owner");

test("le profil permanent est recréé propriétaire, une seule fois", () => {
  const first = ensurePermanentOwner();
  const again = ensurePermanentOwner();
  assert.equal(first.id, again.id);
  assert.equal(again.role, "owner");
  assert.equal(again.name, "Amélia");
  assert.equal(again.isAnonymous, false);
  assert.equal(players.findByToken("permanent-owner-token-for-tests").id, first.id);
});
