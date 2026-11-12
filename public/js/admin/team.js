import { el, byId } from "../dom.js";
import { admin } from "./client.js";

const ROLE_LABELS = { owner: "Owner", administrator: "Administrator" };

const ACTION_LABELS = {
  claim_owner: "Becomes the owner",
  grant_admin: "Makes an administrator",
  revoke_admin: "Removes an administrator",
  set_secret: "Changes the word of the day",
  create_element: "Creates an element",
  edit_element: "Edits an element",
  report_status: "Changes a report's status",
  delete_report: "Deletes a report",
  purge_reports: "Deletes closed reports",
  settings: "Edits the settings",
  delete_player: "Deletes a profile",
  upload_sprite: "Uploads a sprite",
  create_tag: "Creates a Connections tag",
  edit_tag: "Edits a Connections tag",
  delete_tag: "Deletes a Connections tag",
  regenerate_grid: "Redraws a Connections grid",
  playtester: "Changes playtester access",
  connections_access: "Changes who can play Connections"
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
        this.notify(`${player.name} is now an administrator.`);
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
        this.notify(`Administrator limit: ${adminDailyLimit} change(s) per day.`);
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
                  text: "Remove",
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
          el("td", { text: `${a.name} (${ROLE_LABELS[a.role] ?? "former member"})` }),
          el("td", { text: ACTION_LABELS[a.action] ?? a.action }),
          el("td", { text: a.target ?? "-" })
        ])
      )
    );
  }

  async revoke(member) {
    try {
      await admin.revokeAdmin(member.id);
      this.notify(`${member.name} is no longer an administrator.`);
      await this.load();
    } catch (err) {
      this.notify(err.message, true);
    }
  }
}
