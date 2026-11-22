// Boîte aux lettres du menu : la liste des lettres à gauche, la lettre
// ouverte à droite, en carte postale. Le courrier vient de /api/mail ; une
// lettre est lue dès qu'on l'ouvre (côté serveur avec un profil, dans le
// navigateur sans profil).
import { api } from "./api.js";
import { el, byId } from "./dom.js";
import { player } from "./player.js";
import { storage, KEYS } from "./storage.js";
import { renderLetter } from "./letter-format.js";

// Une annonce récente pas encore lue s'ouvre seule en quittant l'écran titre
const FRESH_DAYS = 14;
const STAMPS = { news: "assets/illustration/feather.png", poll: "assets/illustration/typing.png", reply: "assets/illustration/love.png" };

let letters = [];
let current = null;
let onChange = () => {};
let onClose = null;

const localRead = () => new Set(storage.getJson(KEYS.mailRead, []));

function isRead(letter) {
  if (letter.read || localRead().has(letter.id)) return true;
  // La carte postale de la mise à jour, déjà vue avant la boîte aux lettres
  return letter.slug === "welcome-v4" && Boolean(storage.get(KEYS.welcomeSeen));
}

export const unreadCount = () => letters.filter((l) => !isRead(l)).length;

/** Charge le courrier ; listener(unread) est appelé à chaque changement. */
export async function loadMailbox(listener) {
  if (listener) onChange = listener;
  try {
    letters = (await api.mail()).letters;
  } catch {
    letters = [];
  }
  onChange(unreadCount());
  return letters;
}

/** L'annonce récente non lue à montrer en arrivant, ou null. */
export function freshNews() {
  const since = Date.now() - FRESH_DAYS * 86400000;
  return letters.find((l) => l.kind === "news" && !isRead(l) && Date.parse(l.createdAt) >= since) ?? null;
}

function markRead(letter) {
  if (isRead(letter)) return;
  const read = localRead();
  read.add(letter.id);
  storage.setJson(KEYS.mailRead, [...read].slice(-200));
  if (player.token) api.readMail(letter.id).catch(() => {});
  letter.read = true;
  onChange(unreadCount());
}

const formatDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function wrap() {
  let node = byId("mailbox");
  if (!node) {
    node = el("div", { className: "postcard-wrap mailbox-wrap", attrs: { id: "mailbox", hidden: true } });
    node.addEventListener("click", (e) => e.target === node && closeMailbox());
    document.body.append(node);
  }
  return node;
}

function render() {
  const list = el(
    "nav",
    { className: "mailbox-list", attrs: { "aria-label": "Letters" } },
    letters.length
      ? letters.map((letter) =>
          el(
            "button",
            {
              className: `mailbox-item${isRead(letter) ? "" : " unread"}`,
              attrs: { type: "button", "aria-current": String(letter.id === current?.id) },
              on: { click: () => show(letter) }
            },
            [el("strong", { text: letter.title }), el("small", { text: formatDate(letter.createdAt) })]
          )
        )
      : [el("p", { className: "mailbox-empty", text: "No letters yet." })]
  );
  const card = current
    ? el("article", { className: "postcard mailbox-letter", attrs: { role: "document" } }, [
        el("div", { className: "postcard-stamp" }, [el("img", { attrs: { src: STAMPS[current.kind] ?? STAMPS.news, alt: "" } })]),
        el("div", { className: "postcard-postmark", attrs: { "aria-hidden": "true" } }),
        el("div", { className: "postcard-text" }, [
          el("p", { className: "mailbox-date", text: formatDate(current.createdAt) }),
          el("h2", { attrs: { id: "mailbox-title" }, text: current.title }),
          ...renderLetter(current.body)
        ])
      ])
    : el("article", { className: "postcard mailbox-letter" }, [el("p", { text: "Your mailbox is empty for now." })]);
  wrap().replaceChildren(
    el("div", { className: "mailbox", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "mailbox-heading" } }, [
      el("div", { className: "mailbox-side" }, [
        el("h2", { className: "outlined", attrs: { id: "mailbox-heading" }, text: "Mailbox" }),
        list
      ]),
      card,
      el("button", { className: "mailbox-close", attrs: { type: "button", "aria-label": "Close" }, text: "×", on: { click: closeMailbox } })
    ])
  );
}

function show(letter) {
  // Le courrier a pu être rechargé depuis : on garde la version à jour
  current = letter ? letters.find((l) => l.id === letter.id) ?? letter : null;
  if (current) markRead(current);
  render();
  wrap().querySelector(".mailbox-item[aria-current='true']")?.focus({ preventScroll: true });
}

export const mailboxOpen = () => Boolean(byId("mailbox")) && !byId("mailbox").hidden;

/** Ouvre la boîte sur `letter` (par défaut : la première non lue, sinon la plus récente). */
export function openMailbox(letter = null, { closed = null } = {}) {
  onClose = closed;
  wrap().hidden = false;
  show(letter ?? letters.find((l) => !isRead(l)) ?? letters[0] ?? null);
}

export function closeMailbox() {
  if (!mailboxOpen()) return;
  byId("mailbox").hidden = true;
  const done = onClose;
  onClose = null;
  done?.();
}

/** Clavier quand la boîte est ouverte : ↑↓ change de lettre, Échap ferme. */
export function mailboxKey(key) {
  if (key === "Escape" || key === "l" || key === "L") return closeMailbox();
  if (key !== "ArrowUp" && key !== "ArrowDown") return;
  const i = letters.findIndex((l) => l.id === current?.id);
  const next = letters[Math.min(letters.length - 1, Math.max(0, i + (key === "ArrowDown" ? 1 : -1)))];
  if (next && next !== current) show(next);
}
