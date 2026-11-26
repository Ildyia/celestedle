// Fenêtre « Contact the team » (Camp du menu) : un message à l'équipe en
// dehors des reports. Il faut un profil : la réponse arrive dans la boîte
// aux lettres (POST /api/contact).
import { api } from "./api.js";
import { el } from "./dom.js";
import { player } from "./player.js";
import { showToast } from "./toast.js";

const TOPICS = [
  ["question", "A question"],
  ["idea", "An idea"],
  ["problem", "A problem (not a bug)"],
  ["other", "Something else"]
];

export function openContact() {
  const topic = el(
    "select",
    { className: "bug-input", attrs: { id: "contact-topic" } },
    TOPICS.map(([value, label]) => el("option", { text: label, attrs: { value } }))
  );
  const body = el("textarea", {
    className: "bug-input",
    attrs: { id: "contact-body", rows: "6", maxlength: "1000", required: true, placeholder: "Write to the team…" }
  });
  const error = el("p", { className: "form-error" });
  const submit = el("button", { className: "btn-primary", text: "Send", attrs: { type: "submit" } });

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    close();
  };

  const form = el("form", { className: "rules-content bug-modal-content modal-narrow", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "contact-heading" } }, [
    el("h2", { attrs: { id: "contact-heading" }, text: "Contact the team" }),
    el("p", {
      className: "small-subtext",
      text: "A question, an idea, something on your mind? Only the team reads it, and the answer comes to your mailbox. For a bug, use Report a bug instead."
    }),
    el("div", { className: "form-group" }, [el("label", { text: "About", attrs: { for: "contact-topic" } }), topic]),
    el("div", { className: "form-group" }, [el("label", { text: "Your message", attrs: { for: "contact-body" } }), body]),
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
      await player.ensure();
      await api.contactTeam({ topic: topic.value, body: body.value.trim() });
      close();
      showToast("Sent! The team will answer in your mailbox.");
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  const overlay = el("div", { className: "rules-modal" }, [form]);
  overlay.addEventListener("click", (e) => e.target === overlay && close());
  document.addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  body.focus();
}
