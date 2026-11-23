// Fenêtre « Reply » de l'admin : une lettre personnelle à un joueur (auteur
// d'un report ou d'une suggestion), qui arrive dans sa boîte aux lettres.
// send({ title, body }) envoie ; la fenêtre se ferme si tout va bien.
import { el } from "../dom.js";
import { renderLetter } from "../letter-format.js";

export function openReply({ heading, context, title, body = "", send }) {
  const titleInput = el("input", { className: "bug-input", attrs: { type: "text", id: "reply-title", maxlength: "120", value: title } });
  const bodyInput = el("textarea", { className: "bug-input", attrs: { id: "reply-body", rows: "8", maxlength: "4000", required: true } });
  bodyInput.value = body;
  const preview = el("div", { className: "mail-preview reply-preview" });
  const error = el("p", { className: "form-error" });
  const submit = el("button", { className: "btn-primary", text: "Send to their mailbox", attrs: { type: "submit" } });

  const renderPreview = () =>
    preview.replaceChildren(
      el("h2", { text: titleInput.value.trim() || title }),
      ...(bodyInput.value.trim() ? renderLetter(bodyInput.value) : [el("p", { className: "small-subtext", text: "Your answer shows up here as you write it." })])
    );
  titleInput.addEventListener("input", renderPreview);
  bodyInput.addEventListener("input", renderPreview);

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();

  const form = el("form", { className: "rules-content bug-modal-content reply-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "reply-heading" } }, [
    el("h2", { attrs: { id: "reply-heading" }, text: heading }),
    context ? el("p", { className: "small-subtext reply-context", text: context }) : null,
    el("div", { className: "form-group" }, [el("label", { text: "Title", attrs: { for: "reply-title" } }), titleInput]),
    el("div", { className: "form-group" }, [
      el("label", { text: "Letter", attrs: { for: "reply-body" } }),
      bodyInput,
      el("p", { className: "small-subtext", text: 'Only this player sees it. Same formatting as the mailbox: "- " lists, **bold**, *italic*, [text](https://link).' })
    ]),
    preview,
    error,
    el("div", { className: "modal-actions" }, [
      el("button", { className: "btn-secondary", text: "Cancel", attrs: { type: "button" }, on: { click: close } }),
      submit
    ])
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    error.textContent = "";
    try {
      await send({ title: titleInput.value.trim(), body: bodyInput.value });
      close();
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  const overlay = el("div", { className: "rules-modal" }, [form]);
  overlay.addEventListener("click", (e) => e.target === overlay && close());
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  renderPreview();
  bodyInput.focus();
}

/** Ce qui a déjà été envoyé : « Replied ✓ », « Fixed letter sent » (lue ou non). */
export function repliesNote(replies = []) {
  if (!replies.length) return null;
  const parts = replies.map((r) => `${r.auto ? "Fixed letter" : "Reply"} ${r.read ? "read" : "not read yet"}`);
  return el("div", { className: "small-subtext reply-note", text: `✉ ${parts.join(" · ")}` });
}
