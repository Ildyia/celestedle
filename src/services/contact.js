// « Contact the team » : un message d'un joueur à l'équipe, en dehors des
// reports (question, idée, problème…). L'équipe le lit dans l'admin
// (Community → Messages) et répond par une lettre personnelle dans sa boîte
// aux lettres. Le bot Discord le signale dans le salon privé des reports.
const repo = require("../repositories/contact");
const { HttpError } = require("../utils/http-error");
const { nowIso } = require("../utils/dates");

const TOPICS = ["question", "idea", "problem", "other"];
const TOPIC_LABELS = { question: "Question", idea: "Idea", problem: "Problem", other: "Something else" };
const STATUSES = ["new", "done"];
const MAX_BODY = 1000;

// Le bot Discord s'enregistre ici ; sans bot, rien n'est envoyé
let notifier = { contactCreated: async () => {} };
function setNotifier(next) {
  notifier = next;
}

/** Un joueur (avec profil) écrit à l'équipe. */
function create(player, input = {}) {
  const topic = TOPICS.includes(input.topic) ? input.topic : "other";
  const body = String(input.body ?? "").trim();
  if (body.length < 1 || body.length > MAX_BODY) throw new HttpError(400, `Your message must be 1 to ${MAX_BODY} characters.`);
  const message = repo.insert({ playerId: player.id, topic, body, at: nowIso() });
  // Une erreur Discord ne fait jamais échouer l'envoi du joueur
  notifier.contactCreated(message).catch((err) => console.error(`[DISCORD] contactCreated ${message.id} :`, err.message));
  return message;
}

/** Admin : tous les messages, avec les réponses déjà envoyées. */
function list() {
  const replies = require("./mail").repliesTo("contact");
  return repo.list().map((m) => ({ ...m, replies: replies[m.id] ?? [] }));
}

function find(id) {
  const message = repo.findById(Number(id));
  if (!message) throw new HttpError(404, "Message not found.");
  return message;
}

function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new HttpError(400, `Unknown status "${status}".`);
  find(id);
  repo.setStatus(Number(id), status);
  return repo.findById(Number(id));
}

function remove(id) {
  if (!repo.remove(Number(id))) throw new HttpError(404, "Message not found.");
}

/** Admin : réponse en lettre personnelle ; le message passe en « done ». */
function reply(author, id, input = {}) {
  const message = find(id);
  if (!message.playerId) throw new HttpError(409, "This player's profile no longer exists: there's no one to answer.");
  const letter = require("./mail").sendPersonal({
    playerId: message.playerId,
    about: `contact:${message.id}`,
    title: input.title || "About your message",
    body: input.body,
    authorId: author.id
  });
  repo.setStatus(message.id, "done");
  return letter;
}

module.exports = { TOPICS, TOPIC_LABELS, setNotifier, create, list, setStatus, remove, reply, countNew: repo.countNew };
