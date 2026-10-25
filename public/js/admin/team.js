import { el, byId } from "../dom.js";
import { admin } from "./client.js";

const ROLE_LABELS = { owner: "Propriétaire", administrator: "Administrateur" };

const ACTION_LABELS = {
  claim_owner: "Devient propriétaire",
  grant_admin: "Nomme administrateur",
  revoke_admin: "Retire administrateur",
  set_secret: "Change le mot du jour",
  create_element: "Crée un élément",
  edit_element: "Modifie un élément",
  report_status: "Change le statut d'un report",
  delete_report: "Supprime un report",
  purge_reports: "Supprime les reports clos",
  settings: "Modifie les réglages",
  delete_player: "Supprime un profil",
  upload_sprite: "Envoie un sprite",
  create_tag: "Crée un tag Connections",
  edit_tag: "Modifie un tag Connections",
  delete_tag: "Supprime un tag Connections",
  regenerate_grid: "Régénère une grille Connections",
  playtester: "Change l'accès playtester"
};

// Onglet Équipe, réservé au propriétaire : administrateurs, quota, journal
export class TeamTab {
  constructor({ notify }) {
    this.notify = notify;

    byId("team-add-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = byId("team-player-input");
      try {
        const player = await admin.grantAdmin(input.value.trim());
        input.value = "";
        this.notify(`${player.name} est maintenant administrateur.`);
        await this.load();
      } catch (err) {
        this.notify(err.message, true);
      }
    });

    byId("team-limit-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const { adminDailyLimit } = await admin.saveSettings({
          adminDailyLimit: Number(byId("team-limit-input").value)
        });
        this.notify(`Limite des administrateurs : ${adminDailyLimit} modification(s) par jour.`);
      } catch (err) {
        this.notify(err.message, true);
      }
    });
  }

  async load() {
    const [{ team, dailyLimit }, audit] = await Promise.all([admin.team(), admin.audit()]);
    byId("team-limit-input").value = dailyLimit;
    this.renderTeam(team, dailyLimit);
    this.renderAudit(audit);
  }

  renderTeam(team, dailyLimit) {
    byId("team-body").replaceChildren(
      ...team.map((member) =>
        el("tr", {}, [
          el("td", { text: member.name }),
          el("td", {}, [el("span", { className: `badge ${member.role}`, text: ROLE_LABELS[member.role] })]),
          el("td", { text: member.discordTag ?? "-" }),
          el("td", {}, [el("code", { text: member.id })]),
          el("td", {
            className: "num",
            text: member.role === "owner" ? `${member.actionsToday}` : `${member.actionsToday} / ${dailyLimit}`
          }),
          el("td", {}, [
            member.role === "administrator"
              ? el("button", {
                  className: "btn-secondary btn-small",
                  text: "Retirer",
                  attrs: { type: "button" },
                  on: { click: () => this.revoke(member) }
                })
              : null
          ])
        ])
      )
    );
  }

  renderAudit(actions) {
    byId("audit-body").replaceChildren(
      ...actions.map((a) =>
        el("tr", {}, [
          el("td", { text: a.createdAt.replace("T", " ").slice(0, 16) }),
          el("td", { text: `${a.name} (${ROLE_LABELS[a.role] ?? "ancien membre"})` }),
          el("td", { text: ACTION_LABELS[a.action] ?? a.action }),
          el("td", { text: a.target ?? "-" })
        ])
      )
    );
  }

  async revoke(member) {
    try {
      await admin.revokeAdmin(member.id);
      this.notify(`${member.name} n'est plus administrateur.`);
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    }
  }
}
