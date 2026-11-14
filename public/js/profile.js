import { api } from "./api.js";
import { el, byId, clear, openModal } from "./dom.js";
import { formatDuration, formatNumber } from "./format.js";
import { player } from "./player.js";
import { showToast } from "./toast.js";

export function avatarUrl(avatar) {
  return `assets/entities/${avatar}.png`;
}

// Certains sprites ont beaucoup de vide autour du dessin : on les agrandit
// (et on les recentre) pour qu'ils remplissent leur case comme les portraits.
const AVATAR_FIT = {
  "winged-strawberry": "translate(0, 4%) scale(1.1)",
  feather: "translate(-5%, -3%) scale(1.7)",
  refill: "scale(1.45)",
  "double-refill": "scale(1.45)",
  flingbird: "translate(0, 8%) scale(1.6)",
  "cassette-tape": "scale(1.3)",
  "golden-winged-strawberry": "scale(1.25)",
  "theo-crystal": "scale(2.6)",
  pufferfish: "translate(7%, -4%) scale(3.6)",
  bird: "translate(3%, -28%) scale(1.65)"
};
export function avatarFit(avatar) {
  return AVATAR_FIT[avatar] ? `transform: ${AVATAR_FIT[avatar]}` : "";
}

// Fenêtre « My profile » : personnalisation, statistiques, code de récupération
export class ProfilePanel {
  constructor() {
    this.options = null;
    this.statsMode = "normal";
    this.nodes = {
      form: byId("profile-form"),
      name: byId("profile-name-input"),
      discord: byId("profile-discord-input"),
      avatars: byId("profile-avatars"),
      colors: byId("profile-colors"),
      hidden: byId("profile-hidden-checkbox"),
      stats: byId("profile-stats"),
      code: byId("recovery-code"),
      restoreInput: byId("restore-code-input"),
      button: byId("profile-btn")
    };
    this.selected = {};
    // Chapitre atteint : débloque les portraits et couleurs des chapitres
    this.chapter = 0;

    this.nodes.button?.addEventListener("click", () => this.open());
    this.nodes.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.save();
    });
    byId("show-code-btn")?.addEventListener("click", () => this.toggleCode());
    byId("delete-profile-btn")?.addEventListener("click", () => this.deleteProfile());
    byId("copy-code-btn")?.addEventListener("click", () => this.copyCode());
    byId("restore-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.restore();
    });
    document.querySelectorAll("[data-stats-mode]").forEach((btn) =>
      btn.addEventListener("click", () => {
        this.statsMode = btn.dataset.statsMode;
        this.loadStats();
      })
    );
    player.onChange((profile) => this.renderButton(profile));
  }

  renderButton(profile) {
    const label = byId("profile-btn-label");
    const img = byId("profile-btn-avatar");
    if (!label || !img) return;
    label.textContent = profile ? profile.name : "Profile";
    img.src = profile ? avatarUrl(profile.avatar) : "assets/illustration/strawberry.png";
  }

  async open() {
    openModal("profile-modal");
    try {
      this.options ??= await api.profileOptions();
      await player.ensure();
      this.chapter = (await api.myAchievements().catch(() => null))?.climb?.chapter ?? 0;
      this.fillForm();
      await this.loadStats();
    } catch (err) {
      showToast(err.message);
    }
  }

  fillForm() {
    const profile = player.profile;
    this.selected = { avatar: profile.avatar, color: profile.color };
    this.nodes.name.value = profile.name;
    byId("player-id").textContent = profile.id;
    this.nodes.discord.value = profile.discordTag ?? "";
    this.nodes.hidden.checked = profile.isHidden;
    byId("profile-anonymous-note").hidden = !profile.isAnonymous;
    this.nodes.code.textContent = "••••••••••••";
    this.nodes.code.dataset.visible = "false";
    this.renderPickers();
  }

  // Les portraits et couleurs de chaque chapitre suivent ceux de tous,
  // verrouillés (cadenas) tant que le chapitre n'est pas atteint
  renderPickers() {
    const { avatars, colors, rewards = [] } = this.options;
    const lockOf = (chapter) => (chapter > this.chapter ? `Reach Chapter ${chapter} · ${rewards[chapter - 1].name} to unlock` : null);
    const avatarButton = (avatar, lock = null, chapterName = null) => {
      const label = avatar.replace(/-/g, " ");
      return el(
        "button",
        {
          className: `avatar-choice${lock ? " locked" : ""}`,
          attrs: {
            type: "button",
            "aria-pressed": String(avatar === this.selected.avatar),
            "aria-disabled": lock ? "true" : null,
            title: lock ?? (chapterName ? `${label} (${chapterName})` : label)
          },
          on: { click: () => this.pick("avatar", avatar, lock) }
        },
        [el("img", { attrs: { src: avatarUrl(avatar), alt: label, style: avatarFit(avatar) } })]
      );
    };
    const colorButton = (color, lock = null, chapterName = null) =>
      el("button", {
        className: `color-choice${lock ? " locked" : ""}`,
        attrs: {
          type: "button",
          "aria-pressed": String(color === this.selected.color),
          "aria-disabled": lock ? "true" : null,
          "aria-label": lock ?? (chapterName ? `${color} (${chapterName})` : color),
          title: lock ?? chapterName ?? "",
          style: `--swatch: ${color}`
        },
        on: { click: () => this.pick("color", color, lock) }
      });
    clear(this.nodes.avatars);
    this.nodes.avatars.append(
      ...avatars.map((avatar) => avatarButton(avatar)),
      ...rewards.map((r) => avatarButton(r.avatar, lockOf(r.chapter), r.name))
    );
    clear(this.nodes.colors);
    this.nodes.colors.append(
      ...colors.map((color) => colorButton(color)),
      ...rewards.map((r) => colorButton(r.color, lockOf(r.chapter), r.name))
    );
  }

  pick(kind, value, lock) {
    if (lock) return showToast(`${lock}.`);
    this.selected[kind] = value;
    this.renderPickers();
  }

  async save() {
    try {
      await player.update({
        name: this.nodes.name.value,
        avatar: this.selected.avatar,
        color: this.selected.color,
        discordTag: this.nodes.discord.value,
        isHidden: this.nodes.hidden.checked
      });
      this.nodes.discord.value = player.profile.discordTag ?? "";
      byId("profile-anonymous-note").hidden = true;
      showToast("Profile saved.");
    } catch (err) {
      showToast(err.message);
    }
  }

  async loadStats() {
    document.querySelectorAll("[data-stats-mode]").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.statsMode === this.statsMode))
    );
    clear(this.nodes.stats);
    try {
      this.renderStats(await api.myStats(this.statsMode));
    } catch (err) {
      this.nodes.stats.append(el("p", { className: "small-subtext", text: err.message }));
    }
  }

  renderStats(stats) {
    const tile = (label, value) =>
      el("div", { className: "stat-tile" }, [el("strong", { text: String(value) }), el("span", { text: label })]);
    const max = Math.max(1, ...stats.distribution.map((d) => d.count));

    this.nodes.stats.append(
      el("div", { className: "stat-tiles" }, [
        tile("Played", stats.played),
        tile("Win %", stats.winRate),
        tile("Streak", stats.streak.current),
        tile("Best streak", stats.streak.best),
        tile("Avg. tries", formatNumber(stats.avgTries)),
        tile("Avg. time", formatDuration(stats.avgSeconds)),
        tile("Best time", formatDuration(stats.bestSeconds)),
        tile("Forfeits", stats.forfeits + stats.losses)
      ]),
      el("p", { className: "small-subtext", text: "Wins by number of tries" }),
      el(
        "div",
        { className: "distribution" },
        stats.distribution.map((d) =>
          el("div", { className: "distribution-row" }, [
            el("span", { className: "distribution-label", text: d.label }),
            el("span", {
              className: "distribution-bar",
              text: String(d.count),
              attrs: { style: `width: ${Math.max(8, (d.count / max) * 100)}%` }
            })
          ])
        )
      )
    );
  }

  toggleCode() {
    const visible = this.nodes.code.dataset.visible === "true";
    this.nodes.code.textContent = visible ? "••••••••••••" : player.token;
    this.nodes.code.dataset.visible = String(!visible);
  }

  async copyCode() {
    try {
      await navigator.clipboard.writeText(player.token);
      showToast("Recovery code copied. Keep it private!");
    } catch {
      this.toggleCode();
      showToast("Copy failed: select the code and copy it manually.");
    }
  }

  // Premier clic : confirmation ; second clic dans les 5 s : suppression
  async deleteProfile() {
    const button = byId("delete-profile-btn");
    if (button.dataset.confirm !== "true") {
      button.dataset.confirm = "true";
      button.textContent = "Click again to delete everything";
      button.className = "btn-danger";
      setTimeout(() => {
        button.dataset.confirm = "false";
        button.textContent = "Delete my profile";
        button.className = "btn-secondary";
      }, 5000);
      return;
    }
    try {
      await player.remove();
      showToast("Your profile has been deleted.");
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      showToast(err.message);
    }
  }

  async restore() {
    const code = this.nodes.restoreInput.value;
    if (!code.trim()) return;
    try {
      await player.restore(code);
      this.nodes.restoreInput.value = "";
      showToast("Profile restored! Reloading your game…");
      setTimeout(() => location.reload(), 1200);
    } catch {
      showToast("This recovery code doesn't match any profile.");
    }
  }
}
