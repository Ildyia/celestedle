import { el, byId } from "../dom.js";
import { admin } from "./client.js";

const STATUS_LABELS = {
  new: "Nouveau",
  working: "En cours",
  fixed: "Corrigé",
  cant_reproduce: "Non reproductible",
  wrong: "Report erroné"
};

// Tous les reports, statut modifiable (le changement est répercuté sur Discord)
export async function renderReports({ notify }) {
  const { reports, statuses } = await admin.reports();

  byId("reports-body").replaceChildren(
    ...reports.map((report) => {
      const select = el(
        "select",
        {
          className: "bug-input",
          attrs: { "aria-label": `Statut de ${report.id}` },
          on: {
            change: async (e) => {
              try {
                await admin.setReportStatus(report.id, e.target.value);
                notify(`${report.id} : ${STATUS_LABELS[e.target.value]}.`);
              } catch (err) {
                notify(err.message, true);
                e.target.value = report.status;
              }
            }
          }
        },
        statuses.map((s) => el("option", { text: STATUS_LABELS[s] ?? s, attrs: { value: s } }))
      );
      select.value = report.status;

      return el("tr", {}, [
        el("td", { text: report.id }),
        el("td", { text: report.elementName ?? "-" }),
        el("td", { text: report.bugType }),
        el("td", { className: "description-cell", text: `${report.isSpoiler ? "[spoiler] " : ""}${report.description}` }),
        el("td", { className: "num", text: String(report.score) }),
        el("td", { text: report.createdAt?.slice(0, 10) ?? "-" }),
        el("td", {}, [select])
      ]);
    })
  );
}
