// Boîte aux lettres du menu : la liste des lettres à gauche, la lettre
// ouverte à droite, en carte postale. Le courrier vient de /api/mail ; une
// lettre est lue dès qu'on l'ouvre (côté serveur avec un profil, dans le
// navigateur sans profil).
import { api } from "./api.js";
import { el, byId } from "./dom.js";
import { player } from "./player.js";
import { storage, KEYS } from "./storage.js";
import { renderLetter } from "./letter-format.js";
import { showToast } from "./toast.js";

// Une annonce récente pas encore lue s'ouvre seule en quittant l'écran titre
const FRESH_DAYS = 14;
const STAMPS = { "patch-notes": "assets/illustration/options.png", news: "assets/illustration/feather.png", poll: "assets/illustration/typing.png", reply: "assets/illustration/love.png" };

const KIND_LABELS = { "patch-notes": "Patch notes", announcement: "Announcement", poll: "Poll", reply: "Just for you" };
let letters = [];
let current = null;
let onChange = () => {};
let onClose = null;
// Sondage dont on change le vote (le formulaire revient, cases déjà cochées)
let changing = null;

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

/**
 * La lettre à montrer en arrivant, ou null : une réponse personnelle pas
 * encore lue, sinon une annonce récente pas encore lue.
 */
export function freshNews() {
  const since = Date.now() - FRESH_DAYS * 86400000;
  const unread = letters.filter((l) => !isRead(l) && Date.parse(l.createdAt) >= since);
  return unread.find((l) => l.kind === "reply") ?? unread.find((l) => l.kind === "news") ?? null;
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
const formatClose = (iso) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// ===== Sondages =====
// Le profil est créé au premier vote, comme au premier essai d'une partie
async function submitVote(letter, choices) {
  try {
    await player.ensure();
    await api.votePoll(letter.id, choices);
  } catch (err) {
    showToast(err.message);
    return;
  }
  changing = null;
  await loadMailbox();
  show(letters.find((l) => l.id === letter.id) ?? letter);
}

function pollResults(letter) {
  const { poll } = letter;
  const voters = poll.voters ?? 0;
  return el("div", { className: "poll-results" }, [
    ...poll.options.map((o) => {
      const share = voters ? Math.round(((o.votes ?? 0) / voters) * 100) : 0;
      const mine = poll.myChoices.includes(o.position);
      return el("div", { className: `poll-result${mine ? " mine" : ""}` }, [
        el("span", { className: "poll-label", text: `${mine ? "✓ " : ""}${o.label}` }),
        el("span", { className: "poll-share", text: `${share}%` }),
        el("span", { className: "poll-track", attrs: { "aria-hidden": "true" } }, [el("i", { attrs: { style: `width: ${share}%` } })])
      ]);
    }),
    el("p", {
      className: "poll-note",
      text: `${voters} climber${voters === 1 ? "" : "s"} voted, on the site and on Discord. ` +
        (poll.closed ? "This poll is closed." : poll.closesAt ? `Closes ${formatClose(poll.closesAt)}.` : "")
    }),
    poll.closed
      ? null
      : el("button", {
          className: "postcard-btn poll-change",
          attrs: { type: "button" },
          text: "Change my vote",
          on: { click: () => { changing = letter.id; render(); } }
        })
  ]);
}

function pollForm(letter) {
  const { poll } = letter;
  const type = poll.multiple ? "checkbox" : "radio";
  const button = el("button", { className: "postcard-btn", attrs: { type: "submit", disabled: !poll.myChoices.length }, text: poll.myChoices.length ? "Update my vote" : "Vote" });
  const form = el("form", { className: "poll-form" }, [
    el("p", { className: "poll-note", text: (poll.multiple ? "Pick as many as you like." : "Pick one.") + (poll.closesAt ? ` Closes ${formatClose(poll.closesAt)}.` : "") }),
    ...poll.options.map((o) =>
      el("label", { className: "poll-choice" }, [
        el("input", { attrs: { type, name: `poll-${letter.id}`, value: String(o.position), checked: poll.myChoices.includes(o.position) } }),
        el("span", { text: o.label })
      ])
    ),
    button
  ]);
  form.addEventListener("change", () => (button.disabled = !form.querySelector("input:checked")));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    button.disabled = true;
    submitVote(letter, [...form.querySelectorAll("input:checked")].map((input) => Number(input.value)));
  });
  return form;
}

function pollBlock(letter) {
  const { poll } = letter;
  const voted = poll.myChoices.length > 0;
  return poll.closed || (voted && changing !== letter.id) ? pollResults(letter) : pollForm(letter);
}

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
        el("div", { className: "postcard-stamp" }, [el("img", { attrs: { src: STAMPS[current.topic] ?? STAMPS[current.kind] ?? STAMPS.news, alt: "" } })]),
        el("div", { className: "postcard-postmark", attrs: { "aria-hidden": "true" } }),
        el("div", { className: "postcard-text" }, [
          el("p", { className: "mailbox-date", text: [KIND_LABELS[current.kind === "news" ? current.topic : current.kind], formatDate(current.createdAt)].filter(Boolean).join(" · ") }),
          el("h2", { attrs: { id: "mailbox-title" }, text: current.title }),
          ...renderLetter(current.body),
          current.poll ? pollBlock(current) : null
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
  if (letter?.id !== current?.id) changing = null;
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
