import { el, byId } from "../dom.js";
import { admin } from "./client.js";
import { kpi } from "./overview.js";

const ROLE_LABELS = { owner: "Owner", administrator: "Administrator", player: "Player" };

// Recherche de joueurs ; la suppression est réservée au propriétaire
export class PlayersTab {
  constructor({ notify, getRole }) {
    this.notify = notify;
    this.getRole = getRole;
    this.players = [];
    this.pendingDelete = null;

    byId("players-search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.load().catch((err) => this.notify(err.message, true));
    });
    byId("players-all").addEventListener("change", () => this.load().catch((err) => this.notify(err.message, true)));
  }

  async load() {
    this.renderCounts().catch(() => {});
    const query = byId("players-search-input").value.trim();
    const all = byId("players-all").checked;
    this.players = await admin.searchPlayers(query, all);
    byId("players-shown").textContent = query
      ? `${this.players.length} player${this.players.length === 1 ? "" : "s"} matching "${query}" (anonymous profiles included).`
      : `${this.players.length} ${all ? "profiles, anonymous ones included" : "registered profiles"}. Click a column to sort.`;
    this.render();
  }

  // Combien de joueurs : actifs ces 30 jours, profils enregistrés, profils créés
  // (un profil naît au premier essai, anonyme tant qu'il n'est pas enregistré)
  async renderCounts() {
    const c = await admin.playerCounts();
    byId("players-kpis").replaceChildren(
      kpi(`Active · ${c.activeDays} days`, c.active, `${c.activeRegistered} registered · ${c.active - c.activeRegistered} anonymous`),
      kpi("Registered profiles", c.registered, "name and avatar saved"),
      kpi("Profiles created", c.total, "anonymous ones included")
    );
  }

  // Accès aux modes en test (Connections) ; l'équipe admin l'a déjà
  playtesterButton(player) {
    if (player.role !== "player") return null;
    return el("button", {
      className: "btn-secondary btn-small",
      text: player.isPlaytester ? "Remove playtester" : "Make playtester",
      attrs: { type: "button" },
      on: {
        click: async () => {
          try {
            const updated = await admin.setPlaytester(player.id, !player.isPlaytester);
            Object.assign(player, { isPlaytester: updated.isPlaytester });
            this.notify(
              updated.isPlaytester
                ? `"${player.name}" is a playtester: they can play Connections.`
                : `"${player.name}" is no longer a playtester.`
            );
            this.render();
          } catch (err) {
            this.notify(err.message, true);
          }
        }
      }
    });
  }

  deleteButton(player) {
    if (this.getRole() !== "owner" || player.role === "owner") return null;
    const confirming = this.pendingDelete === player.id;
    return el("button", {
      className: confirming ? "btn-danger btn-small" : "btn-secondary btn-small",
      text: confirming ? "Confirm" : "Delete",
      attrs: { type: "button" },
      on: {
        click: async () => {
          if (!confirming) {
            this.pendingDelete = player.id;
            this.render();
            setTimeout(() => {
              if (this.pendingDelete === player.id) {
                this.pendingDelete = null;
                this.render();
              }
            }, 4000);
            return;
          }
          try {
            await admin.deletePlayer(player.id);
            this.pendingDelete = null;
            this.players = this.players.filter((p) => p.id !== player.id);
            this.notify(`Profile "${player.name}" deleted, with its games.`);
            this.render();
          } catch (err) {
            this.notify(err.message, true);
          }
        }
      }
    });
  }

  render() {
    byId("players-body").replaceChildren(
      ...this.players.map((player) =>
        el("tr", {}, [
          el("td", {}, [
            player.name,
            player.isAnonymous ? el("span", { className: "badge", text: "anonymous", attrs: { title: "Never saved: created on the first guess" } }) : null,
            player.isHidden ? el("span", { className: "badge", text: "hidden", attrs: { title: "Hidden from the leaderboards" } }) : null
          ]),
          el("td", {}, [el("code", { text: player.id })]),
          el("td", { text: player.discordTag ?? "-" }),
          el("td", { className: "row-actions" }, [
            ROLE_LABELS[player.role] ?? player.role,
            player.isPlaytester ? el("span", { className: "badge admin", text: "Playtester" }) : null
          ]),
          el("td", { className: "num", text: String(player.games) }),
          el("td", { text: player.createdAt?.slice(0, 10) ?? "-" }),
          el("td", { text: player.lastSeenAt?.replace("T", " ").slice(0, 16) ?? "-" }),
          el("td", { className: "row-actions" }, [this.playtesterButton(player), this.deleteButton(player)])
        ])
      )
    );
  }
}
