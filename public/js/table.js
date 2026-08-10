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
      this.resolveEntityImage(data.nom, app).then((imgPath) => {
        if (!imgPath) return;
        const thumb = document.createElement("img");
        thumb.className = "entity-thumb";
        thumb.src = imgPath;
        thumb.alt = formattedName;
        nameCell.insertBefore(thumb, nameCell.firstChild);
      });
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
      createCell(data.valeurs?.couleur || "-", data.verdict?.couleur),
    );
    row.appendChild(
      createCell(data.valeurs?.hitbox || "-", data.verdict?.hitbox),
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
  },

  async resolveEntityImage(name, app) {
    if (!name) return null;

    if (!app._entityImageMapPromise && app.entityImageMap === null) {
      const candidates = [
        "/assets/entities/mapping.json",
        "/public/assets/entities/mapping.json",
        "assets/entities/mapping.json",
        "public/assets/entities/mapping.json",
      ];

      app._entityImageMapPromise = (async () => {
        let json = null;
        for (const url of candidates) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              json = await res.json();
              break;
            }
          } catch (e) {}
        }
        const norm = {};
        try {
          Object.keys(json || {}).forEach((k) => {
            norm[k.toLowerCase()] = json[k];
          });
        } catch (e) {}
        app.entityImageMap = norm;
      })();
    }

    if (app._entityImageMapPromise) await app._entityImageMapPromise;

    const key = name.toLowerCase();
    if (app.entityImageMap && app.entityImageMap[key]) {
      return app.entityImageMap[key];
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const exts = ["png", "webp", "jpg", "jpeg"];
    const bases = [
      "/assets/entities/",
      "/public/assets/entities/",
      "assets/entities/",
      "public/assets/entities/",
    ];

    for (let b = 0; b < bases.length; b++) {
      for (let i = 0; i < exts.length; i++) {
        const found = await new Promise((resolve) => {
          const path = `${bases[b]}${slug}.${exts[i]}`;
          const img = new Image();
          img.onload = () => resolve(path);
          img.onerror = () => resolve(null);
          img.src = path;
        });
        if (found) return found;
      }
    }

    return null;
  },
};
