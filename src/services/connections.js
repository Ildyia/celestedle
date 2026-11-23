const crypto = require("crypto");
const config = require("../config");
const db = require("../db");
const elementsRepo = require("../repositories/elements");
const repo = require("../repositories/connections");
const { HttpError } = require("../utils/http-error");
const { todayParis, nowIso, secondsBetween, addDays } = require("../utils/dates");
const { GROUP_SIZE, GROUP_COUNT, buildCategories, generatePuzzle, seededRandom } = require("./connections-generator");
const { generateInWorker, diagnoseInWorker } = require("./connections-worker");

const MAX_MISTAKES = 4;
const MODES = ["normal", "hard"];

// Indices, du plus léger au plus fort, chacun une fois par partie. Ils ne font
// pas perdre, mais comptent comme une erreur dans les classements.
// kinds : la sorte de chaque groupe ; category : le nom d'un groupe pas encore
// trouvé (le tag d'abord) ; pair : 2 cases qui vont ensemble
const HINT_TYPES = ["kinds", "category", "pair"];
const MAX_HINTS = { normal: 3, hard: 1 };
// Normal : un seul groupe tag par grille (en Hard, la limite commune)
const MAX_TAGS = { normal: 1, hard: undefined };

// Normal : grilles sans faux groupe. Hard : faux groupes permis (seule
// l'unicité de la solution compte), les cases peuvent être pré-coloriées.
function checkMode(mode = "normal") {
  if (!MODES.includes(mode)) throw new HttpError(400, `Unknown mode "${mode}".`);
  return mode;
}

// Clé d'une grille dans connection_puzzles.date (et connection_games.date) :
// la date pour la grille du jour en normal (comme avant le mode Hard),
// « hard:date » en Hard, « practice:id » / « practice-hard:id » pour
// l'entraînement d'un joueur
function dailyKey(mode, date) {
  return mode === "hard" ? `hard:${date}` : date;
}

function practiceKey(mode, playerId) {
  return mode === "hard" ? `practice-hard:${playerId}` : `practice:${playerId}`;
}

// Même grille pour tout le monde un jour donné (et pour une même graine)
function seedFor(key) {
  return crypto.createHash("sha256").update(`connections|${key}|${config.randomSeed ?? ""}`).digest().readUInt32LE(0);
}

// Mode normal : un seul groupe chapitre (« First appears in … » ou
// « Appears in … », les plus durs à deviner)
const MAX_PER_KIND = { normal: { chapter: 1 }, hard: {} };

// Variété : ce qui est sorti les RECENT_DAYS jours avant `date` (les deux
// modes), pesant d'autant plus que c'est récent (RECENT_DECAY par jour), et
// la grille de l'autre mode du même jour, si elle existe déjà
const RECENT_DAYS = 30;
const RECENT_DECAY = 0.85;
function recentFor(date, mode) {
  // counts : nombre de sorties de chaque élément (sans pondération), pour le
  // plafond des éléments trop sortis
  const recent = { elements: new Map(), categories: new Map(), counts: new Map() };
  const add = (puzzle, weight) => {
    if (!puzzle) return;
    for (const id of puzzle.tiles) {
      recent.elements.set(id, (recent.elements.get(id) ?? 0) + weight);
      recent.counts.set(id, (recent.counts.get(id) ?? 0) + 1);
    }
    for (const g of puzzle.groups) recent.categories.set(g.key, (recent.categories.get(g.key) ?? 0) + weight);
  };
  add(repo.findPuzzle(dailyKey(mode === "hard" ? "normal" : "hard", date)), 1);
  for (let ago = 1; ago <= RECENT_DAYS; ago++) {
    const day = addDays(date, -ago);
    for (const m of MODES) add(repo.findPuzzle(dailyKey(m, day)), RECENT_DECAY ** (ago - 1));
  }
  return recent;
}

// Options du générateur pour un mode, avec ce qui est sorti avant `date`
// (variété : voir generatePuzzle)
function generateOptions(mode, date = todayParis()) {
  return { allowDecoys: mode === "hard", maxTags: MAX_TAGS[mode], maxPerKind: MAX_PER_KIND[mode], recent: recentFor(date, mode) };
}

function generate(mode, random, date = todayParis()) {
  return generatePuzzle(elementsRepo.listActive(), repo.listTags(), random, generateOptions(mode, date));
}

// Même grille, calculée dans le worker (connections-worker.js) : le serveur
// continue de répondre pendant ce temps. seed null : tirage au hasard.
function generateAsync(mode, seed, date = todayParis()) {
  return generateInWorker(elementsRepo.listActive(), repo.listTags(), seed, generateOptions(mode, date));
}

function getPuzzle(date = todayParis(), mode = "normal") {
  const key = dailyKey(checkMode(mode), date);
  // Normalement déjà tirée en avance (prepareUpcoming) ; sinon, sur place
  return repo.findPuzzle(key) ?? repo.createPuzzleIfMissing(key, generate(mode, seededRandom(seedFor(key)), date), nowIso());
}

// Grille d'un jour, tirée dans le worker si elle n'existe pas encore : la même
// que getPuzzle aurait tirée (même graine)
async function ensurePuzzle(date, mode = "normal") {
  const key = dailyKey(checkMode(mode), date);
  const existing = repo.findPuzzle(key);
  if (existing) return existing;
  const puzzle = await generateAsync(mode, seedFor(key), date);
  return repo.createPuzzleIfMissing(key, puzzle, nowIso());
}

// Grilles d'aujourd'hui et des UPCOMING_DAYS - 1 jours suivants, tirées en
// avance (au démarrage puis toutes les heures) : le premier joueur du jour
// n'attend pas, et le calcul ne bloque personne
const UPCOMING_DAYS = 3;
async function prepareUpcoming() {
  const today = todayParis();
  for (let i = 0; i < UPCOMING_DAYS; i++) {
    for (const mode of MODES) {
      try {
        await ensurePuzzle(addDays(today, i), mode);
      } catch (err) {
        console.error(`[ERROR] Connections ${mode} ${addDays(today, i)}`, err);
      }
    }
  }
}

function startPreparingUpcoming() {
  prepareUpcoming();
  setInterval(prepareUpcoming, 60 * 60 * 1000).unref();
}

// Nouvelle grille tirée par l'admin : les parties du jour repartent de zéro
async function regeneratePuzzle(date, mode = "normal") {
  const key = dailyKey(checkMode(mode), date);
  return repo.replacePuzzle(key, await generateAsync(mode, null, date), nowIso());
}

// Grille d'entraînement d'un joueur (playtest) : rangée avec les grilles du
// jour sous une clé à part, hors classement, retirée à volonté sans toucher
// la grille commune
function getPracticePuzzle(playerId, mode) {
  const key = practiceKey(mode, playerId);
  return repo.findPuzzle(key) ?? repo.createPuzzleIfMissing(key, generate(mode, Math.random), nowIso());
}

async function newPracticePuzzle(player, mode = "normal") {
  repo.replacePuzzle(practiceKey(checkMode(mode), player.id), await generateAsync(mode, null), nowIso());
  return getState(player, { mode, practice: true });
}

function puzzleFor(player, mode, practice) {
  return practice && player ? getPracticePuzzle(player.id, mode) : getPuzzle(todayParis(), mode);
}

function loadGame(playerId, puzzle) {
  let game = playerId ? repo.findGame(puzzle.date, playerId) : null;
  let reset = false;
  if (game && game.puzzle_version !== puzzle.version) {
    game = repo.restartGame(game.id, puzzle.version, nowIso());
    reset = true;
  }
  return { game, reset };
}

function tileOf(element) {
  return { nom: element.nom };
}

function groupView(group, elementsById) {
  return {
    label: group.label,
    kind: group.kind,
    level: group.level,
    members: group.elementIds.map((id) => tileOf(elementsById.get(id)))
  };
}

// Ce que montre un indice déjà utilisé
function hintView(hint, puzzle, elementsById) {
  if (hint.type === "kinds") return { type: "kinds", kinds: puzzle.groups.map((g) => g.kind).sort() };
  if (hint.type === "category") {
    const group = puzzle.groups[hint.groupIndex];
    return { type: "category", label: group.label, kind: group.kind };
  }
  return { type: "pair", tiles: hint.elementIds.map((id) => tileOf(elementsById.get(id))) };
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

// Ce que révèle un indice, tiré au moment de l'utiliser parmi les groupes pas
// encore trouvés
function drawHint(type, puzzle, found, used, random) {
  if (type === "kinds") return {};
  const left = puzzle.groups.map((g, i) => i).filter((i) => !found.has(i));
  if (type === "category") {
    const tags = left.filter((i) => puzzle.groups[i].kind === "tag");
    return { groupIndex: pick(tags.length ? tags : left, random) };
  }
  // Paire : de préférence dans un autre groupe que celui déjà nommé
  const named = used.find((h) => h.type === "category")?.groupIndex;
  const others = left.filter((i) => i !== named);
  const members = [...puzzle.groups[pick(others.length ? others : left, random)].elementIds];
  const first = members.splice(Math.floor(random() * members.length), 1)[0];
  return { elementIds: [first, pick(members, random)] };
}

// État renvoyé au joueur : les groupes ne sont révélés qu'une fois trouvés,
// ou tous à la fin de la partie
function buildState(puzzle, game, { mode, practice, reset = false }) {
  const elementsById = new Map(puzzle.tiles.map((id) => [id, elementsRepo.findById(id)]));
  const attempts = game ? repo.attempts(game.id) : [];
  const hints = game ? repo.hints(game.id) : [];
  const foundIndexes = attempts.filter((a) => a.groupIndex !== null).map((a) => a.groupIndex);
  const foundIds = new Set(foundIndexes.flatMap((i) => puzzle.groups[i].elementIds));
  const status = game?.status ?? "playing";
  const finished = status !== "playing";
  const now = finished && game.finished_at ? game.finished_at : nowIso();

  return {
    date: todayParis(),
    mode,
    practice,
    // Identifie la grille et sa version : les marques de couleur du joueur
    // (gardées dans son navigateur) repartent de zéro quand elle change
    gridId: `${puzzle.date}#${puzzle.version}`,
    status,
    reset,
    maxMistakes: MAX_MISTAKES,
    mistakes: attempts.filter((a) => a.groupIndex === null).length,
    maxHints: MAX_HINTS[mode],
    hints: hints.map((hint) => hintView(hint, puzzle, elementsById)),
    tiles: puzzle.tiles.filter((id) => !foundIds.has(id)).map((id) => tileOf(elementsById.get(id))),
    found: foundIndexes.map((i) => groupView(puzzle.groups[i], elementsById)),
    // Pour le partage : couleur du groupe de chaque case proposée
    attempts: attempts.map((a) => a.elementIds.map((id) => puzzle.groups.find((g) => g.elementIds.includes(id)).level)),
    startedAt: game?.started_at ?? null,
    elapsedSeconds: game ? secondsBetween(game.started_at, now) : 0,
    solution: finished ? puzzle.groups.map((g) => groupView(g, elementsById)) : null
  };
}

function getState(player, { mode = "normal", practice = false } = {}) {
  checkMode(mode);
  const puzzle = puzzleFor(player, mode, practice);
  const { game, reset } = loadGame(player?.id, puzzle);
  return buildState(puzzle, game, { mode, practice: practice && Boolean(player), reset });
}

// Proposition de 4 cases : bonne, « à une case près » ou fausse
// gridId : la grille affichée chez le joueur. Si elle a changé entre-temps
// (minuit passé, grille régénérée), on le dit au lieu de chercher ses cases
// dans la nouvelle grille.
const guess = db.transaction((player, names, { mode = "normal", practice = false, gridId } = {}) => {
  checkMode(mode);
  if (!Array.isArray(names) || names.length !== GROUP_SIZE) {
    throw new HttpError(400, `Select exactly ${GROUP_SIZE} tiles.`);
  }
  const puzzle = puzzleFor(player, mode, practice);
  if (gridId !== undefined && gridId !== `${puzzle.date}#${puzzle.version}`) {
    throw new HttpError(409, practice ? "This grid was replaced: here is the new one." : "A new grid is out: here it is!", {
      gridChanged: true
    });
  }
  const loaded = loadGame(player.id, puzzle);
  let { game } = loaded;
  if (game && game.status !== "playing") {
    throw new HttpError(409, practice ? "This grid is over: draw a new one." : "Today's grid is already over.");
  }

  const attempts = game ? repo.attempts(game.id) : [];
  const found = new Set(attempts.filter((a) => a.groupIndex !== null).map((a) => a.groupIndex));
  const remaining = puzzle.tiles
    .map((id) => elementsRepo.findById(id))
    .filter((e) => !found.has(puzzle.groups.findIndex((g) => g.elementIds.includes(e.id))));
  const ids = names.map((name) => {
    const match = remaining.find((e) => e.nom.toLowerCase() === String(name).toLowerCase());
    if (!match) throw new HttpError(400, `"${name}" is not one of the tiles left.`);
    return match.id;
  });
  if (new Set(ids).size !== GROUP_SIZE) throw new HttpError(400, "Select 4 different tiles.");

  const key = JSON.stringify([...ids].sort((a, b) => a - b));
  if (attempts.some((a) => JSON.stringify(a.elementIds) === key)) {
    throw new HttpError(409, "You already tried these four!");
  }

  const at = nowIso();
  game ??= repo.createGame({ date: puzzle.date, playerId: player.id, version: puzzle.version, startedAt: at });

  const groupIndex = puzzle.groups.findIndex((g) => ids.every((id) => g.elementIds.includes(id)));
  const oneAway =
    groupIndex === -1 && puzzle.groups.some((g) => ids.filter((id) => g.elementIds.includes(id)).length === GROUP_SIZE - 1);
  repo.addAttempt(game.id, JSON.parse(key), groupIndex === -1 ? null : groupIndex, at);

  const mistakes = attempts.filter((a) => a.groupIndex === null).length + (groupIndex === -1 ? 1 : 0);
  if (groupIndex !== -1 && found.size + 1 === GROUP_COUNT) repo.finishGame(game.id, "won", at);
  else if (mistakes >= MAX_MISTAKES) repo.finishGame(game.id, "lost", at);

  // Faux groupe : les 4 cases partagent bien quelque chose, mais ce n'est pas
  // un des groupes de la grille (une erreur quand même). Deux cas :
  // - « too_many » : plus de 4 cases restantes ont ce point commun, l'une des
  //   4 choisies appartient donc à un autre groupe ;
  // - « decoy » : exactement ces 4 l'ont, mais en faire un groupe empêche de
  //   finir la grille.
  const shared =
    groupIndex === -1
      ? buildCategories(elementsRepo.listActive(), repo.listTags()).filter((c) => ids.every((id) => c.members.has(id)))
      : [];
  const widest = Math.max(0, ...shared.map((c) => remaining.filter((e) => c.members.has(e.id)).length));
  const result =
    groupIndex !== -1 ? "correct" : oneAway ? "one_away" : widest > GROUP_SIZE ? "too_many" : shared.length ? "decoy" : "wrong";
  return {
    result,
    ...(result === "too_many" ? { sharedBy: widest } : {}),
    state: buildState(puzzle, repo.findGameById(game.id), { mode, practice, reset: loaded.reset })
  };
});

// Indice : chacun une fois, MAX_HINTS par partie selon le mode
const useHint = db.transaction((player, type, { mode = "normal", practice = false, gridId, random = Math.random } = {}) => {
  checkMode(mode);
  if (!HINT_TYPES.includes(type)) throw new HttpError(400, `Unknown hint "${type}".`);
  const puzzle = puzzleFor(player, mode, practice);
  if (gridId !== undefined && gridId !== `${puzzle.date}#${puzzle.version}`) {
    throw new HttpError(409, practice ? "This grid was replaced: here is the new one." : "A new grid is out: here it is!", {
      gridChanged: true
    });
  }
  const loaded = loadGame(player.id, puzzle);
  let { game } = loaded;
  if (game && game.status !== "playing") throw new HttpError(409, "This grid is over.");

  const used = game ? repo.hints(game.id) : [];
  if (used.some((h) => h.type === type)) throw new HttpError(409, "You already used this hint.");
  if (used.length >= MAX_HINTS[mode]) throw new HttpError(409, "No hints left for this grid.");

  const at = nowIso();
  game ??= repo.createGame({ date: puzzle.date, playerId: player.id, version: puzzle.version, startedAt: at });
  const found = new Set(
    repo
      .attempts(game.id)
      .filter((a) => a.groupIndex !== null)
      .map((a) => a.groupIndex)
  );
  repo.addHint(game.id, type, drawHint(type, puzzle, found, used, random), at);
  return { state: buildState(puzzle, repo.findGameById(game.id), { mode, practice, reset: loaded.reset }) };
});

// Chiffres du jour de la grille commune (hors entraînement)
function communityStats(mode = "normal") {
  const { wins, finished, avgMistakes, avgHints, avgSeconds } = repo.dayStats(dailyKey(checkMode(mode), todayParis()));
  return { wins, avgMistakes, avgHints, avgSeconds, winRate: finished ? Math.round((wins / finished) * 100) : null };
}

// Admin, onglet Aujourd'hui : grille du jour et chiffres de chaque mode
function todayOverview() {
  const date = todayParis();
  return Object.fromEntries(
    MODES.map((mode) => {
      let puzzle;
      try {
        puzzle = puzzlePreview(date, mode);
      } catch (err) {
        puzzle = { date, mode, error: `${err.name}: ${err.message}` };
      }
      const { finished, ...stats } = repo.dayStats(dailyKey(mode, date));
      return [mode, { puzzle, stats: { ...stats, winRate: finished ? Math.round((stats.wins / finished) * 100) : null } }];
    })
  );
}

function leaderboard(playerId, mode = "normal") {
  return repo.dailyBoard(dailyKey(checkMode(mode), todayParis())).map((row) => ({
    rank: row.rank,
    player: { id: row.id, name: row.name, avatar: row.avatar, color: row.color },
    isMe: row.id === playerId,
    mistakes: row.mistakes,
    hints: row.hints,
    seconds: row.seconds
  }));
}

// Admin : tags et aperçu des grilles

function validateTag(input) {
  const label = String(input.label ?? "").trim();
  if (label.length < 2 || label.length > 60) throw new HttpError(400, "The tag name must be 2 to 60 characters.");
  const description = String(input.description ?? "").trim().slice(0, 300);
  const activeIds = new Set(elementsRepo.listActive().map((e) => e.id));
  const elementIds = [...new Set(Array.isArray(input.elementIds) ? input.elementIds.map(Number) : [])];
  const unknown = elementIds.find((id) => !activeIds.has(id));
  if (unknown !== undefined) throw new HttpError(400, `Unknown element id ${unknown}.`);
  return { label, description, elementIds };
}

function saveTag(id, input) {
  if (id !== null && !repo.findTag(id)) throw new HttpError(404, "Unknown tag.");
  try {
    return repo.saveTag(id, validateTag(input));
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") throw new HttpError(409, "A tag with this name already exists.");
    throw err;
  }
}

function deleteTag(id) {
  if (!repo.deleteTag(id)) throw new HttpError(404, "Unknown tag.");
}

// Idée de tag envoyée depuis la page de jeu, relue dans l'admin
function suggestTag(player, input = {}) {
  const label = String(input.label ?? "").trim();
  if (label.length < 2 || label.length > 60) throw new HttpError(400, "The tag name must be 2 to 60 characters.");
  const elements = String(input.elements ?? "").trim().slice(0, 1000);
  const note = String(input.note ?? "").trim().slice(0, 500);
  return { id: repo.addSuggestion({ playerId: player.id, label, elements, note }) };
}

function deleteSuggestion(id) {
  if (!repo.deleteSuggestion(id)) throw new HttpError(404, "Unknown suggestion.");
}

// Grille d'un jour avec ses réponses, pour la relecture dans l'admin
// Grilles du jour passées (pas l'entraînement) et parties finies dessus : pour
// savoir combien de fois chaque tag est sorti, et s'il a été trouvé
const diagnosticStmts = {
  puzzles: db.prepare("SELECT date, version, groups FROM connection_puzzles WHERE date NOT LIKE 'practice%'"),
  found: db.prepare(`
    SELECT g.date, g.puzzle_version AS version, a.group_index AS groupIndex
    FROM connection_games g JOIN connection_attempts a ON a.game_id = g.id
    WHERE g.status <> 'playing' AND g.date NOT LIKE 'practice%' AND a.group_index IS NOT NULL
  `),
  finished: db.prepare(`
    SELECT date, puzzle_version AS version, COUNT(*) AS players FROM connection_games
    WHERE status <> 'playing' AND date NOT LIKE 'practice%' GROUP BY date, puzzle_version
  `)
};

const DIAGNOSTIC_TRIALS = 30;
const DIAGNOSTIC_BUDGET_MS = 15000;

/**
 * Diagnostic des tags (onglet Connections de l'admin), pour voir lesquels
 * empêchent de tirer des grilles :
 * - size, status : membres actifs, et si le tag peut servir de groupe ;
 * - overlap : la catégorie qui partage le plus de membres avec lui ;
 * - daily : grilles du jour où il est sorti, et part des joueurs qui l'ont
 *   trouvé ;
 * - trials : grilles d'essai (par mode) où il est choisi (picked), et tirages
 *   qu'il fait rejeter (decoy : il formerait un faux groupe ; incompatible :
 *   pas assez de membres à lui une fois les autres groupes posés).
 * Les essais tournent dans le worker : le serveur répond pendant ce temps.
 */
async function tagDiagnostics() {
  const elements = elementsRepo.listActive();
  const tags = repo.listTags();
  const categories = buildCategories(elements, tags);
  const reports = {};
  for (const mode of MODES) {
    reports[mode] = await diagnoseInWorker(elements, tags, generateOptions(mode), {
      trials: DIAGNOSTIC_TRIALS,
      budgetMs: DIAGNOSTIC_BUDGET_MS
    });
  }

  // Sorties dans les grilles du jour, et groupes trouvés
  const players = new Map(diagnosticStmts.finished.all().map((r) => [`${r.date}|${r.version}`, r.players]));
  const found = new Map();
  for (const r of diagnosticStmts.found.all()) {
    const key = `${r.date}|${r.version}|${r.groupIndex}`;
    found.set(key, (found.get(key) ?? 0) + 1);
  }
  const daily = new Map();
  for (const p of diagnosticStmts.puzzles.all()) {
    JSON.parse(p.groups).forEach((g, index) => {
      if (!g.key.startsWith("tag:")) return;
      const d = daily.get(g.key) ?? { grids: 0, players: 0, found: 0 };
      d.grids++;
      d.players += players.get(`${p.date}|${p.version}`) ?? 0;
      d.found += found.get(`${p.date}|${p.version}|${index}`) ?? 0;
      daily.set(g.key, d);
    });
  }

  const rows = tags.map((tag) => {
    const key = `tag:${tag.id}`;
    const category = categories.find((c) => c.key === key);
    const size = category.members.size;
    let overlap = null;
    for (const other of categories) {
      if (other === category) continue;
      const shared = [...category.members].filter((id) => other.members.has(id)).length;
      if (shared && (!overlap || shared > overlap.shared)) overlap = { label: other.label, kind: other.kind, shared, size: other.members.size };
    }
    const status = tag.unreviewedIds.length ? "unreviewed" : size < GROUP_SIZE ? "too small" : category.usable ? "ok" : "too big";
    const trials = Object.fromEntries(
      MODES.map((mode) => [
        mode,
        {
          picked: reports[mode].picked[key] ?? 0,
          decoy: reports[mode].blame[key]?.decoy ?? 0,
          incompatible: reports[mode].blame[key]?.incompatible ?? 0
        }
      ])
    );
    return { id: tag.id, label: tag.label, size, status, overlap, daily: daily.get(key) ?? { grids: 0, players: 0, found: 0 }, trials };
  });
  const blocked = (r) => r.trials.normal.decoy + r.trials.normal.incompatible;
  rows.sort((a, b) => blocked(b) - blocked(a) || b.size - a.size);

  // Les autres catégories (couleurs, formes…) qui bloquent le plus, pour comparer
  const tagKeys = new Set(tags.map((t) => `tag:${t.id}`));
  const others = Object.entries(reports.normal.blame)
    .filter(([key]) => !tagKeys.has(key))
    .map(([key, b]) => ({ label: categories.find((c) => c.key === key)?.label ?? key, kind: key.split(":")[0], ...b }))
    .sort((a, b) => b.decoy + b.incompatible - (a.decoy + a.incompatible))
    .slice(0, 8);

  const summary = (r) => ({ trials: r.trials, failed: r.failed, rules: r.rules, ms: r.ms, rejected: r.rejected });
  return { summary: { normal: summary(reports.normal), hard: summary(reports.hard) }, tags: rows, others };
}

function puzzlePreview(date, mode = "normal") {
  const puzzle = getPuzzle(date, mode);
  return {
    date,
    mode,
    source: puzzle.source,
    version: puzzle.version,
    rule: puzzle.rule,
    groups: puzzle.groups.map((g) => ({
      label: g.label,
      kind: g.kind,
      level: g.level,
      members: g.elementIds.map((id) => elementsRepo.findById(id).nom)
    }))
  };
}

module.exports = {
  MAX_MISTAKES,
  MODES,
  getPuzzle,
  ensurePuzzle,
  tagDiagnostics,
  startPreparingUpcoming,
  UPCOMING_DAYS,
  regeneratePuzzle,
  getState,
  guess,
  newPracticePuzzle,
  leaderboard,
  communityStats,
  todayOverview,
  useHint,
  HINT_TYPES,
  MAX_HINTS,
  listTags: () => repo.listTags(),
  saveTag,
  deleteTag,
  suggestTag,
  listSuggestions: () => repo.listSuggestions(),
  deleteSuggestion,
  puzzlePreview
};
