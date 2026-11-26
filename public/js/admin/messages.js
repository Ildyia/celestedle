// Page « Messages » (Community) : ce que les joueurs écrivent à l'équipe
// depuis le menu (Camp → Contact the team). Répondre envoie une lettre
// personnelle et marque le message comme traité.
import { el, byId } from "../dom.js";
import { admin } from "./client.js";
import { openReply, repliesNote } from "./reply.js";

const formatDate = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export class MessagesTab {
  constructor({ notify }) {
    this.notify = notify;
    this.confirming = null; // message dont la suppression attend confirmation
  }

  async load() {
    const { messages, topics } = await admin.contactMessages();
    this.topics = topics;
    this.render(messages);
  }

  render(messages) {
    const body = byId("messages-body");
    if (!messages.length) {
      body.replaceChildren(el("tr", {}, [el("td", { text: "No messages yet.", attrs: { colspan: "5" } })]));
      return;
    }
    body.replaceChildren(
      ...messages.map((m) =>
        el("tr", { className: m.status === "done" ? "contact-done" : "" }, [
          el("td", { className: "contact-message" }, [
            el("span", { className: "badge", text: this.topics?.[m.topic] ?? m.topic }),
            el("p", { text: m.body }),
            repliesNote(m.replies)
          ]),
          el("td", {}, [
            el("div", { text: m.playerName ?? "Deleted profile" }),
            m.discordTag ? el("div", { className: "small-subtext", text: `Discord: ${m.discordTag}` }) : null
          ]),
          el("td", { text: formatDate(m.createdAt), attrs: { "data-sort": m.createdAt } }),
          el("td", { text: m.status === "done" ? "Done" : "New" }),
          el("td", { className: "row-actions" }, [
            m.playerName
              ? el("button", { className: "btn-secondary btn-small", text: "Reply", attrs: { type: "button" }, on: { click: () => this.reply(m) } })
              : null,
            el("button", {
              className: "btn-secondary btn-small",
              text: m.status === "done" ? "Reopen" : "Mark done",
              attrs: { type: "button" },
              on: { click: () => this.toggle(m) }
            }),
            el("button", {
              className: "btn-danger btn-small",
              text: this.confirming === m.id ? "Confirm" : "Delete",
              attrs: { type: "button" },
              on: { click: () => this.remove(m) }
            })
          ])
        ])
      )
    );
  }

  reply(message) {
    openReply({
      heading: `Reply to ${message.playerName}`,
      context: `${this.topics?.[message.topic] ?? message.topic}: “${message.body.length > 200 ? `${message.body.slice(0, 199)}…` : message.body}”`,
      title: "About your message",
      send: async (letter) => {
        await admin.replyToContact(message.id, letter);
        this.notify(`Letter sent to ${message.playerName}.`);
        await this.load();
      }
    });
  }

  async toggle(message) {
    try {
      await admin.setContactStatus(message.id, message.status === "done" ? "new" : "done");
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    }
  }

  async remove(message) {
    if (this.confirming !== message.id) {
      this.confirming = message.id;
      return this.load();
    }
    try {
      await admin.deleteContact(message.id);
      this.confirming = null;
      this.notify("Message deleted.");
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    }
  }
}
