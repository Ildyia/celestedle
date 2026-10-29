const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreGames, playerTotals, PRIOR_GAMES } = require("../src/services/ranking");

const game = (playerId, board, won, cost, date = "2026-10-29") => ({ playerId, board, date, won, cost });
const scoreOf = (scored, playerId, board = "normal") =>
  scored.find((g) => g.playerId === playerId && g.board === board).score;

test("score : part des joueurs du jour battus, défaite à 0, égalité à moitié", () => {
  const scored = scoreGames([
    game("a", "normal", true, 3),
    game("b", "normal", true, 4),
    game("c", "normal", true, 4),
    game("d", "normal", true, 30),
    game("e", "normal", false, 12)
  ]);
  assert.equal(scoreOf(scored, "a"), 100);
  assert.equal(scoreOf(scored, "b"), 62.5); // bat d et e, égalité avec c
  assert.equal(scoreOf(scored, "d"), 25); // bat seulement e, malgré ses 30 essais
  assert.equal(scoreOf(scored, "e"), 0);
});

test("score : gagner quand peu de joueurs gagnent rapporte plus", () => {
  const hard = [game("a", "hard", true, 6), ...["b", "c", "d", "e"].map((id) => game(id, "hard", false, 8))];
  const normal = ["a", "b", "c", "d", "e"].map((id, i) => game(id, "normal", true, 2 + i));
  const scored = scoreGames([...hard, ...normal]);
  assert.equal(scoreOf(scored, "a", "hard"), 100);
  assert.equal(scoreOf(scored, "c", "normal"), 50);
});

test("score : chaque mode et chaque jour sont comparés à part", () => {
  const scored = scoreGames([
    game("a", "normal", true, 2),
    game("b", "normal", true, 9),
    game("c", "normal", true, 9),
    game("b", "cx-normal", true, 0),
    game("c", "cx-normal", true, 3),
    game("a", "cx-normal", true, 1),
    game("a", "normal", true, 9, "2026-10-28")
  ]);
  assert.equal(scoreOf(scored, "b", "cx-normal"), 100);
  assert.equal(scored.find((g) => g.date === "2026-10-28").score, 50); // seul ce jour-là
});

test("score : avec moins de 3 joueurs, une victoire vaut 50", () => {
  const scored = scoreGames([game("a", "hard", true, 2), game("b", "hard", false, 8)]);
  assert.equal(scoreOf(scored, "a", "hard"), 50);
  assert.equal(scoreOf(scored, "b", "hard"), 0);
});

test("général : la moyenne lissée ne favorise ni le volume ni les comptes neufs", () => {
  const scored = [
    // Compte neuf : une partie parfaite
    { playerId: "new", score: 100, won: true },
    // Bon joueur récent : 20 parties à 90
    ...Array.from({ length: 20 }, () => ({ playerId: "good", score: 90, won: true })),
    // Joueur régulier mais moyen : 100 parties à 60
    ...Array.from({ length: 100 }, () => ({ playerId: "grinder", score: 60, won: true }))
  ];
  const totals = Object.fromEntries(playerTotals(scored).map((t) => [t.playerId, t]));
  const average = (100 + 20 * 90 + 100 * 60) / 121;
  assert.equal(totals.new.rating, (100 + PRIOR_GAMES * average) / (1 + PRIOR_GAMES));
  assert.ok(totals.good.rating > totals.grinder.rating);
  assert.ok(totals.good.rating > totals.new.rating);
  // La semaine additionne : le volume compte
  assert.ok(totals.grinder.points > totals.good.points);
  assert.equal(totals.good.games, 20);
  assert.equal(totals.good.wins, 20);
});
