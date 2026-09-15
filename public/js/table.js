import { API_BASE_URL } from "./api.js";

export const TableManager = {
  addRow(data, app) {
    if (!app.nodes.tableBody) return;

    const row = document.createElement("tr");
    const createCell = (text, className) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      cell.className = className || "wrong";
      return cell;
    };

    const formattedName = data.nom
      ? data.nom.charAt(0).toUpperCase() + data.nom.slice(1)
      : "Unknown";
    const nameCell = document.createElement("td");
    nameCell.className = data.verdict?.isCorrect ? "correct" : "wrong";

    const nameText = document.createElement("div");
    nameText.textContent = formattedName;
    nameCell.appendChild(nameText);

    if (data.nom) {
      const thumb = document.createElement("img");
      thumb.className = "entity-thumb";
      thumb.src = API_BASE_URL + `/sprite/${data.nom}`;
      thumb.alt = formattedName;
      nameCell.insertBefore(thumb, nameCell.firstChild);
    }

    if (data.isSynonym && data.synonymOriginal) {
      const synonymBadge = document.createElement("span");
      synonymBadge.className = "synonym-indicator";
      synonymBadge.textContent = `Used synonym: ${data.synonymOriginal}`;
      nameCell.appendChild(synonymBadge);
    }

    row.appendChild(nameCell);
    row.appendChild(createCell(data.valeurs?.type || "-", data.verdict?.type));
    row.appendChild(createCell(data.valeurs?.lieu || "-", data.verdict?.lieu));
    row.appendChild(
      createCell(data.valeurs?.couleur || "-", data.verdict?.couleur)
    );
    row.appendChild(
      createCell(data.valeurs?.hitbox || "-", data.verdict?.hitbox)
    );

    app.nodes.tableBody.insertBefore(row, app.nodes.tableBody.firstChild);
  },

  insertSolutionRow(solutionName, attrs = {}, app) {
    if (!app.nodes.tableBody) return;

    const row = document.createElement("tr");
    const createCell = (text, className) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      cell.className = className || "wrong";
      return cell;
    };

    const nameCell = document.createElement("td");
    nameCell.className = "correct solution-row";
    const nameText = document.createElement("div");
    nameText.textContent = solutionName;
    nameCell.appendChild(nameText);

    row.appendChild(nameCell);
    row.appendChild(createCell(attrs.type || "-", "correct"));
    const lieuText = Array.isArray(attrs.lieu)
      ? attrs.lieu.join(", ")
      : attrs.lieu || "-";
    row.appendChild(createCell(lieuText, "correct"));
    const couleurText = Array.isArray(attrs.couleur)
      ? attrs.couleur.join(", ")
      : attrs.couleur || "-";
    row.appendChild(createCell(couleurText, "correct"));
    row.appendChild(createCell(attrs.hitbox || "-", "correct"));

    app.nodes.tableBody.insertBefore(row, app.nodes.tableBody.firstChild);
  }
};
