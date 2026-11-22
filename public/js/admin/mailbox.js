// Onglet Mailbox : écrire une lettre pour tous les joueurs, la voir comme dans
// le jeu, l'envoyer (et la poster sur Discord), puis la corriger ou la
// supprimer. Courrier : src/services/mail.js.
import { el, byId } from "../dom.js";
import { renderLetter } from "../letter-format.js";
import { admin } from "./client.js";

const formatDate = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export class MailboxTab {
  constructor({ notify }) {
    this.notify = notify;
    this.letters = [];
    this.discord = { channelId: "", roleId: "" };
    this.editing = null;
    this.confirmDelete = null;
    this.form = byId("mail-form");
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submit();
    });
    for (const id of ["mail-title", "mail-body"]) byId(id).addEventListener("input", () => this.preview());
    byId("mail-cancel-btn").addEventListener("click", () => this.edit(null));
    this.preview();
  }

  async load() {
    const { letters, discord } = await admin.mail();
    this.letters = letters;
    this.discord = discord;
    this.renderDiscordOption();
    this.renderList();
  }

  renderDiscordOption() {
    const ready = Boolean(this.discord.channelId);
    const box = byId("mail-discord");
    box.disabled = !ready || Boolean(this.editing);
    if (!ready) box.checked = false;
    byId("mail-discord-label").textContent = this.editing
      ? "Editing also updates its Discord message, if it has one"
      : ready
        ? `Also post it on Discord${this.discord.roleId ? " and ping the role" : ""}`
        : "Discord: choose a channel in Settings first";
  }

  preview() {
    const title = byId("mail-title").value.trim();
    const body = byId("mail-body").value;
    byId("mail-preview").replaceChildren(
      el("p", { className: "mail-preview-date", text: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) }),
      el("h2", { text: title || "Your title" }),
      ...(body.trim() ? renderLetter(body) : [el("p", { className: "small-subtext", text: "Your letter shows up here as you write it." })])
    );
  }

  renderList() {
    const rows = this.letters.map((letter) =>
      el("tr", { className: this.editing?.id === letter.id ? "selected" : "" }, [
        el("td", {}, [el("strong", { text: letter.title })]),
        el("td", { text: formatDate(letter.createdAt) }),
        el("td", { text: `${letter.reads} player${letter.reads === 1 ? "" : "s"}` }),
        el("td", { text: letter.discordMessageId ? "Posted" : "-" }),
        el("td", { className: "row-actions" }, [
          el("button", { className: "btn-secondary", text: "Edit", attrs: { type: "button" }, on: { click: () => this.edit(letter) } }),
          el("button", {
            className: "btn-danger",
            text: this.confirmDelete === letter.id ? "Delete for good?" : "Delete",
            attrs: { type: "button" },
            on: { click: () => this.remove(letter) }
          })
        ])
      ])
    );
    byId("mail-body-list").replaceChildren(
      ...(rows.length ? rows : [el("tr", {}, [el("td", { text: "No letters sent yet.", attrs: { colspan: "5" } })])])
    );
  }

  edit(letter) {
    this.editing = letter;
    byId("mail-title").value = letter?.title ?? "";
    byId("mail-body").value = letter?.body ?? "";
    byId("mail-form-title").textContent = letter ? `Edit "${letter.title}"` : "New letter";
    byId("mail-submit-btn").textContent = letter ? "Save changes" : "Send to everyone";
    byId("mail-cancel-btn").hidden = !letter;
    this.renderDiscordOption();
    this.preview();
    this.renderList();
    if (letter) byId("mail-title").focus();
  }

  async submit() {
    const letter = { title: byId("mail-title").value, body: byId("mail-body").value };
    const button = byId("mail-submit-btn");
    button.disabled = true;
    try {
      if (this.editing) {
        await admin.editMail(this.editing.id, letter);
        this.notify(`"${letter.title.trim()}" updated.`);
      } else {
        const sent = await admin.sendMail({ ...letter, discord: byId("mail-discord").checked });
        this.notify(`"${sent.title}" sent${sent.discordMessageId ? " and posted on Discord" : ""}.`);
      }
      this.edit(null);
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    } finally {
      button.disabled = false;
    }
  }

  // Premier clic : confirmation ; second clic : suppression
  async remove(letter) {
    if (this.confirmDelete !== letter.id) {
      this.confirmDelete = letter.id;
      this.renderList();
      return;
    }
    this.confirmDelete = null;
    try {
      await admin.deleteMail(letter.id);
      if (this.editing?.id === letter.id) this.edit(null);
      this.notify(`"${letter.title}" deleted.`);
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    }
  }
}
