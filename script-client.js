document.addEventListener("DOMContentLoaded", () => {
  const aujourdHui = new Date().toISOString().split("T")[0];

  const dateSauvegardee = localStorage.getItem("celestedle_date");
  if (dateSauvegardee !== aujourdHui) {
    localStorage.removeItem("celestedle_tries");
    localStorage.removeItem("celestedle_gameover");
    localStorage.removeItem("celestedle_status");
    localStorage.removeItem("celestedle_history");
    localStorage.setItem("celestedle_date", aujourdHui);
  }

  let nbTry = parseInt(localStorage.getItem("celestedle_tries")) || 0;
  const tryCountSpan = document.getElementById("try-count");
  if (tryCountSpan) tryCountSpan.textContent = nbTry;

  const isGameOver = localStorage.getItem("celestedle_gameover") === "true";
  const gameStatus = localStorage.getItem("celestedle_status");
  const form = document.getElementById("guess-form");
  const shareBtn = document.getElementById("share-btn");
  const giveupBtn = document.getElementById("giveup-btn");

  if (isGameOver && form) {
    form.style.display = "none";
    if (giveupBtn) giveupBtn.style.display = "none";
    if (shareBtn) shareBtn.style.display = "block";

    const messageContainer = document.createElement("div");
    if (gameStatus === "lose") {
      messageContainer.className = "lose-message";
      messageContainer.innerHTML = `
                <h2>Dommage... Abandon ! ❌</h2>
                <p>Tu n'as pas trouvé la cible aujourd'hui.</p>
            `;
    } else {
      messageContainer.className = "win-message";
      messageContainer.innerHTML = `
                <h2>GG ! Victoire ! 🎉</h2>
                <p>Tu as trouvé l'élément secret en <strong>${nbTry}</strong> tentatives.</p>
            `;
    }
    form.parentNode.insertBefore(messageContainer, form);
  }

  const historique =
    JSON.parse(localStorage.getItem("celestedle_history")) || [];
  historique.forEach((data) => {
    ajouterLigneTableau(data);
  });

  fetch("https://celestedle-api.onrender.com/api/elements")
    .then((res) => res.json())
    .then((elements) => {
      const datalist = document.getElementById("element-suggestions");
      if (!datalist) return;

      elements.forEach((nom) => {
        const option = document.createElement("option");
        option.value = nom.charAt(0).toUpperCase() + nom.slice(1);
        datalist.appendChild(option);
      });
    })
    .catch((err) => console.error("Erreur chargement éléments:", err));

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("element-input");
      const choix = input ? input.value.trim().toLowerCase() : "";

      if (!choix) return;

      fetch("https://celestedle-api.onrender.com/api/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choix }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Élément invalide ou erreur serveur");
          return res.json();
        })
        .then((data) => {
          nbTry++;
          localStorage.setItem("celestedle_tries", nbTry);
          if (tryCountSpan) tryCountSpan.textContent = nbTry;

          historique.push(data);
          localStorage.setItem(
            "celestedle_history",
            JSON.stringify(historique),
          );

          ajouterLigneTableau(data);
          input.value = "";

          if (data.verdict.isCorrect) {
            confetti({
              particleCount: 150,
              spread: 80,
              origin: { y: 0.6 },
            });

            const winContainer = document.createElement("div");
            winContainer.className = "win-message";
            winContainer.innerHTML = `
                        <h2>GG ! Victoire ! 🎉</h2>
                        <p>Tu as trouvé l'élément secret en <strong>${nbTry}</strong> tentatives.</p>
                    `;
            form.parentNode.insertBefore(winContainer, form);

            localStorage.setItem("celestedle_gameover", "true");
            localStorage.setItem("celestedle_status", "win");
            form.style.display = "none";
            if (giveupBtn) giveupBtn.style.display = "none";
            if (shareBtn) shareBtn.style.display = "block";
          }
        })
        .catch((err) => {
          alert("Cet élément n'existe pas dans la liste !");
          console.error("Erreur submit:", err);
        });
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const hist = JSON.parse(localStorage.getItem("celestedle_history")) || [];
      if (hist.length === 0) return;

      const conversionScore = { correct: "🟩", partial: "🟧", wrong: "🟥" };
      let textePartage = `Celestedle du jour en ${nbTry} coups\n\n`;

      hist.forEach((tryData) => {
        const iconType = conversionScore[tryData.verdict.type];
        const iconLieu = conversionScore[tryData.verdict.lieu];
        const iconCouleur = conversionScore[tryData.verdict.couleur];
        textePartage += `${iconType}${iconLieu}${iconCouleur}\n`;
      });

      navigator.clipboard
        .writeText(textePartage)
        .then(() => {
          shareBtn.textContent = "Copié !";
          setTimeout(() => {
            shareBtn.textContent = "Partager";
          }, 2000);
        })
        .catch((err) => console.error("Impossible de copier", err));
    });
  }
});

window.forceReset = function () {
  const mdp = prompt("Entrez le mot de passe admin pour le reset :");
  if (!mdp) return;

  fetch("https://celestedle-api.onrender.com/api/admin/verifier-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: mdp }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Mot de passe incorrect");
      return res.json();
    })
    .then(() => {
      localStorage.removeItem("celestedle_tries");
      localStorage.removeItem("celestedle_gameover");
      localStorage.removeItem("celestedle_status");
      localStorage.removeItem("celestedle_history");
      localStorage.removeItem("celestedle_date");
      alert("Données locales réinitialisées ! Recharge la page (F5).");
    })
    .catch((err) => alert(err.message));
};

window.setSecret = function (nomElement) {
  const mdp = prompt("Entrez le mot de passe admin pour changer la cible :");
  if (!mdp) return;

  fetch("https://celestedle-api.onrender.com/api/admin/set-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: mdp, nom: nomElement }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) alert("Erreur : " + data.error);
      else alert(data.message);
    })
    .catch((err) => console.error("Erreur serveur:", err));
};

function ajouterLigneTableau(data) {
  const tbody = document.getElementById("guesses-body");
  if (!tbody) return;

  const row = document.createElement("tr");

  const cellNom = document.createElement("td");
  cellNom.textContent = data.nom.charAt(0).toUpperCase() + data.nom.slice(1);
  cellNom.className = data.verdict.isCorrect ? "correct" : "wrong";
  row.appendChild(cellNom);

  const cellType = document.createElement("td");
  cellType.textContent = data.valeurs.type;
  cellType.className = data.verdict.type;
  row.appendChild(cellType);

  const cellLieu = document.createElement("td");
  cellLieu.textContent = data.valeurs.lieu;
  cellLieu.className = data.verdict.lieu;
  row.appendChild(cellLieu);

  const cellCouleur = document.createElement("td");
  cellCouleur.textContent = data.valeurs.couleur;
  cellCouleur.className = data.verdict.couleur;
  row.appendChild(cellCouleur);

  tbody.insertBefore(row, tbody.firstChild);
}
