const crypto = require("crypto");
const reportsRepo = require("../repositories/reports");
const elementsRepo = require("../repositories/elements");
const daily = require("./daily");
const { MODE_IDS } = require("./modes");
const { todayParis } = require("../utils/dates");
const { HttpError } = require("../utils/http-error");

const BUG_TYPES = ["Error in hints", "Wrong element data", "Typo / Grammar", "Technical Bug", "Other"];
const STATUSES = ["new", "working", "fixed", "cant_reproduce", "wrong"];
const MAX_DESCRIPTION = 1000;

// Mots ignorés dans la recherche de doublons
const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "not", "but", "are", "was", "its",
  "it's", "should", "would", "could", "have", "has", "when", "there", "they", "from",
  "into", "than", "then", "also", "just", "like", "because", "about", "which"
]);

// Le bot Discord s'enregistre ici au démarrage ; sans bot, rien n'est envoyé
let notifier = {
  reportCreated: async () => {},
  reportUpdated: async () => {},
  reportDeleted: async () => {}
};

function setNotifier(next) {
  notifier = next;
}

// Une erreur Discord ne doit jamais faire échouer l'action du joueur.
// `origin` évite de réécrire le message Discord d'où vient l'action.
function notify(event, report, origin = "web") {
  notifier[event](report, origin).catch((err) =>
    console.error(`[DISCORD] ${event} ${report.id} :`, err.message)
  );
}

function keywords(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}']+/u)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
  );
}

function newReportId() {
  let id;
  do {
    id = `BUG-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  } while (reportsRepo.exists(id));
  return id;
}

// created_at est en UTC (« AAAA-MM-JJ HH:MM:SS », ou ISO pour les anciens reports)
function reportDay(createdAt) {
  const iso = createdAt.includes("T") ? createdAt : `${createdAt.replace(" ", "T")}Z`;
  return todayParis(new Date(iso));
}

// Un spoiler ne compte que tant qu'il concerne un mot du jour actuel : son
// élément est la réponse d'un des modes aujourd'hui, ou, sans élément, il a été
// posté aujourd'hui. Passé ce délai, le report s'affiche normalement.
function spoilerContext() {
  const secretIds = new Set(MODE_IDS.map((mode) => daily.getTodaySecret(mode).element_id));
  const today = todayParis();
  return (report) =>
    report.isSpoiler &&
    (report.elementId !== null ? secretIds.has(report.elementId) : reportDay(report.createdAt) === today);
}

// Vue publique : le nom de l'élément d'un spoiler actif n'est jamais envoyé
function publicView(report, isActiveSpoiler) {
  if (!isActiveSpoiler(report)) return { ...report, isSpoiler: false };
  return { ...report, elementId: null, elementName: null };
}

function toPublic(report) {
  return publicView(report, spoilerContext());
}

function list(voterId) {
  const isActiveSpoiler = spoilerContext();
  return reportsRepo.listOpen(voterId).map((report) => publicView(report, isActiveSpoiler));
}

// Reports ouverts proches : même élément, et/ou mots-clés en commun
function findSimilar({ elementName, description }, voterId, limit = 5) {
  const element = elementName ? elementsRepo.findByName(elementName) : null;
  const words = keywords(description);
  const isActiveSpoiler = spoilerContext();

  return reportsRepo
    .listOpen(voterId)
    .map((report) => {
      const shared = [...keywords(report.description)].filter((w) => words.has(w)).length;
      // Rapprocher par élément un spoiler actif révélerait la réponse du jour
      const sameElement = element && report.elementId === element.id && !isActiveSpoiler(report);
      return { report, score: (sameElement ? 3 : 0) + shared };
    })
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score || b.report.score - a.report.score)
    .slice(0, limit)
    .map(({ report }) => publicView(report, isActiveSpoiler));
}

// `player` : auteur, si le joueur a un profil (visible seulement par l'admin)
function create(input, player = null) {
  const description = String(input.description ?? "").trim();
  if (description.length < 1 || description.length > MAX_DESCRIPTION) {
    throw new HttpError(400, `Details must be between 1 and ${MAX_DESCRIPTION} characters.`);
  }
  const bugType = BUG_TYPES.includes(input.bugType) ? input.bugType : "Other";
  const element = input.elementName ? elementsRepo.findByName(input.elementName) : null;

  const report = reportsRepo.create({
    id: newReportId(),
    elementId: element?.id ?? null,
    elementName: element?.nom ?? null,
    bugType,
    description,
    isSpoiler: Boolean(input.isSpoiler),
    playerId: player?.id ?? null
  });
  notify("reportCreated", report);
  return report;
}

function vote(reportId, voterId, isUp, origin = "web") {
  if (!reportsRepo.exists(reportId)) throw new HttpError(404, "Report not found.");
  reportsRepo.toggleVote(reportId, voterId, isUp ? 1 : -1);
  const report = reportsRepo.findById(reportId, voterId);
  notify("reportUpdated", report, origin);
  return report;
}

function setStatus(reportId, status, origin = "web") {
  if (!STATUSES.includes(status)) throw new HttpError(400, `Unknown status "${status}".`);
  if (!reportsRepo.exists(reportId)) throw new HttpError(404, "Report not found.");
  reportsRepo.setStatus(reportId, status);
  const report = reportsRepo.findById(reportId);
  notify("reportUpdated", report, origin);
  return report;
}

// Supprime le report et ses votes ; les messages Discord sont retirés aussi
function remove(reportId) {
  const report = reportsRepo.findById(reportId);
  if (!report) throw new HttpError(404, "Report not found.");
  reportsRepo.remove(reportId);
  notify("reportDeleted", report);
  return report;
}

// Supprime tous les reports clos (corrigés, non reproductibles, erronés)
function removeClosed() {
  const closed = reportsRepo.listClosed();
  for (const report of closed) {
    reportsRepo.remove(report.id);
    notify("reportDeleted", report);
  }
  return closed.length;
}

module.exports = {
  BUG_TYPES,
  remove,
  removeClosed,
  STATUSES,
  setNotifier,
  list,
  toPublic,
  listAll: reportsRepo.listAll,
  findById: reportsRepo.findById,
  findSimilar,
  create,
  vote,
  setStatus,
  setDiscordIds: reportsRepo.setDiscordIds
};
