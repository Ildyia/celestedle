import { api } from "./api.js";
import { el, byId, clear, openModal } from "./dom.js";
import { formatDuration, formatNumber } from "./format.js";
import { player } from "./player.js";
import { showToast } from "./toast.js";

export function avatarUrl(avatar) {
  return `assets/entities/${avatar}.png`;
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

    this.nodes.button?.addEventListener("click", () => this.open());
    this.nodes.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.save();
    });
    byId("show-code-btn")?.addEventListener("click", () => this.toggleCode());
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
    this.nodes.discord.value = profile.discordTag ?? "";
    this.nodes.hidden.checked = profile.isHidden;
    this.nodes.code.textContent = "••••••••••••";
    this.nodes.code.dataset.visible = "false";
    this.renderPickers();
  }

  renderPickers() {
    const { avatars, colors } = this.options;
    clear(this.nodes.avatars);
    this.nodes.avatars.append(
      ...avatars.map((avatar) =>
        el(
          "button",
          {
            className: "avatar-choice",
            attrs: { type: "button", "aria-pressed": String(avatar === this.selected.avatar), title: avatar.replace(/-/g, " ") },
            on: { click: () => { this.selected.avatar = avatar; this.renderPickers(); } }
          },
          [el("img", { attrs: { src: avatarUrl(avatar), alt: avatar.replace(/-/g, " ") } })]
        )
      )
    );
    clear(this.nodes.colors);
    this.nodes.colors.append(
      ...colors.map((color) =>
        el("button", {
          className: "color-choice",
          attrs: { type: "button", "aria-pressed": String(color === this.selected.color), "aria-label": color, style: `--swatch: ${color}` },
          on: { click: () => { this.selected.color = color; this.renderPickers(); } }
        })
      )
    );
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
