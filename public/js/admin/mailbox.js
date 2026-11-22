// Onglet Mailbox : écrire une lettre ou un sondage pour tous les joueurs, le
// voir comme dans le jeu, l'envoyer (et le poster sur Discord), puis le
// corriger, le fermer (sondage) ou le supprimer. Courrier : src/services/mail.js.
import { el, byId } from "../dom.js";
import { renderLetter } from "../letter-format.js";
import { admin } from "./client.js";

const OPTIONS_MAX = 10;
const formatDate = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export class MailboxTab {
  constructor({ notify }) {
    this.notify = notify;
    this.letters = [];
    this.discord = { channelId: "", roleId: "" };
    this.editing = null;
    this.confirmDelete = null;
    this.kind = "news";
    this.form = byId("mail-form");
    document.querySelectorAll("[data-mail-kind]").forEach((b) => b.addEventListener("click", () => this.setKind(b.dataset.mailKind)));
    byId("mail-add-option").addEventListener("click", () => this.addOption(""));
    byId("mail-multiple").addEventListener("change", () => this.preview());
    this.resetOptions();
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

  // ===== Sondage =====
  setKind(kind) {
    this.kind = kind;
    document.querySelectorAll("[data-mail-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mailKind === kind)));
    byId("mail-poll-fields").hidden = kind !== "poll" || Boolean(this.editing);
    byId("mail-title-label").textContent = kind === "poll" ? "Question" : "Title";
    byId("mail-submit-btn").textContent = this.editing ? "Save changes" : kind === "poll" ? "Send the poll" : "Send to everyone";
    this.preview();
  }

  resetOptions() {
    byId("mail-options").replaceChildren();
    this.addOption("");
    this.addOption("");
    byId("mail-multiple").checked = false;
    byId("mail-closes").value = "";
  }

  addOption(value) {
    const box = byId("mail-options");
    if (box.children.length >= OPTIONS_MAX) return;
    const index = box.children.length + 1;
    const input = el("input", { className: "bug-input", attrs: { type: "text", maxlength: "80", value, placeholder: `Answer ${index}`, "aria-label": `Answer ${index}` } });
    input.addEventListener("input", () => this.preview());
    const row = el("div", { className: "mail-option" }, [
      input,
      el("button", {
        className: "btn-secondary",
        text: "×",
        attrs: { type: "button", "aria-label": `Remove answer ${index}` },
        on: { click: () => { if (box.children.length > 2) { row.remove(); this.preview(); } } }
      })
    ]);
    box.append(row);
    byId("mail-add-option").disabled = box.children.length >= OPTIONS_MAX;
    this.preview();
  }

  options() {
    return [...byId("mail-options").querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
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
    const poll = this.kind === "poll" && !this.editing;
    const multiple = byId("mail-multiple")?.checked;
    const nodes = [
      el("p", { className: "mail-preview-date", text: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) }),
      el("h2", { text: title || (poll ? "Your question" : "Your title") }),
      ...(body.trim() ? renderLetter(body) : [el("p", { className: "small-subtext", text: "Your letter shows up here as you write it." })]),
      poll
        ? el("div", { className: "mail-preview-poll" }, [
            el("p", { className: "mail-preview-date", text: multiple ? "Pick as many as you like." : "Pick one." }),
            ...(this.options().length ? this.options() : ["Answer 1", "Answer 2"]).map((label) =>
              el("label", { className: "mail-preview-choice" }, [el("input", { attrs: { type: multiple ? "checkbox" : "radio", disabled: true } }), label])
            )
          ])
        : null
    ];
    byId("mail-preview").replaceChildren(...nodes.filter(Boolean));
  }

  // Résultats d'un sondage dans la liste des envois
  pollSummary(letter) {
    const { poll } = letter;
    const voters = poll.voters ?? 0;
    return el("div", { className: "mail-poll-summary" }, [
      el("span", {
        className: "small-subtext",
        text: `Poll · ${voters} voter${voters === 1 ? "" : "s"} · ${poll.closed ? "closed" : poll.closesAt ? `closes ${formatDate(poll.closesAt)}` : "open"}${poll.multiple ? " · several answers" : ""}`
      }),
      ...poll.options.map((o) => {
        const share = voters ? Math.round((o.votes / voters) * 100) : 0;
        return el("div", { className: "mail-poll-row" }, [
          el("span", { text: o.label }),
          el("span", { className: "mail-poll-count", text: `${o.votes} · ${share}%` }),
          el("span", { className: "insights-track" }, [el("i", { attrs: { style: `width: ${share}%` } })])
        ]);
      })
    ]);
  }

  renderList() {
    const rows = this.letters.map((letter) =>
      el("tr", { className: this.editing?.id === letter.id ? "selected" : "" }, [
        el("td", {}, [el("strong", { text: letter.title }), letter.poll ? this.pollSummary(letter) : null]),
        el("td", { text: formatDate(letter.createdAt) }),
        el("td", { text: `${letter.reads} player${letter.reads === 1 ? "" : "s"}` }),
        el("td", { text: letter.discordMessageId ? "Posted" : "-" }),
        el("td", {}, [el("div", { className: "row-actions" }, [
          el("button", { className: "btn-secondary", text: "Edit", attrs: { type: "button" }, on: { click: () => this.edit(letter) } }),
          letter.poll && !letter.poll.closed
            ? el("button", { className: "btn-secondary", text: "Close now", attrs: { type: "button" }, on: { click: () => this.close(letter) } })
            : null,
          el("button", {
            className: "btn-danger",
            text: this.confirmDelete === letter.id ? "Delete for good?" : "Delete",
            attrs: { type: "button" },
            on: { click: () => this.remove(letter) }
          })
        ])])
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
    byId("mail-cancel-btn").hidden = !letter;
    byId("mail-kind").hidden = Boolean(letter);
    if (!letter) this.resetOptions();
    this.setKind(letter ? letter.kind : this.kind);
    this.renderDiscordOption();
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
        const closes = byId("mail-closes").value;
        const poll = this.kind === "poll"
          ? { kind: "poll", options: this.options(), multiple: byId("mail-multiple").checked, closesAt: closes ? new Date(closes).toISOString() : null }
          : {};
        const sent = await admin.sendMail({ ...letter, ...poll, discord: byId("mail-discord").checked });
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

  async close(letter) {
    try {
      await admin.closePoll(letter.id);
      this.notify(`"${letter.title}" is closed: players now see the final results.`);
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
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
