import { el, byId } from "../dom.js";
import { admin } from "./client.js";

const ROLE_LABELS = { owner: "Propriétaire", administrator: "Administrateur", player: "Joueur" };

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
  }

  async load() {
    this.players = await admin.searchPlayers(byId("players-search-input").value.trim());
    this.render();
  }

  deleteButton(player) {
    if (this.getRole() !== "owner" || player.role === "owner") return null;
    const confirming = this.pendingDelete === player.id;
    return el("button", {
      className: confirming ? "btn-danger btn-small" : "btn-secondary btn-small",
      text: confirming ? "Confirmer" : "Supprimer",
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
            this.notify(`Profil « ${player.name} » supprimé, avec ses parties.`);
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
          el("td", { text: player.name }),
          el("td", {}, [el("code", { text: player.id })]),
          el("td", { text: player.discordTag ?? "-" }),
          el("td", { text: ROLE_LABELS[player.role] ?? player.role }),
          el("td", { className: "num", text: String(player.games) }),
          el("td", { text: player.lastSeenAt?.replace("T", " ").slice(0, 16) ?? "-" }),
          el("td", {}, [this.deleteButton(player)])
        ])
      )
    );
  }
}
