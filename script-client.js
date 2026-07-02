document.addEventListener("DOMContentLoaded", () => {
  // Dictionnaire de synonymes pour les noms d'éléments
  const synonymes = {
    cassette: "cassette tape",
    tape: "cassette tape",
    tile: "tiles",
    crumble: "crumble block",
    crumbleblock: "crumble block",
    jumpthroughs: "jumpthrough",
    "blue booster": "green booster",
    piaf: "bird",
    oiseau: "bird",
    "moving block": "move block",
    zippers: "zip movers",
  };

  const aujourdHui = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });

  const dateSauvegardee = localStorage.getItem("celestedle_date");
  if (dateSauvegardee !== aujourdHui) {
    localStorage.removeItem("celestedle_tries");
    localStorage.removeItem("celestedle_gameover");
    localStorage.removeItem("celestedle_status");
    localStorage.removeItem("celestedle_history");
    localStorage.removeItem("celestedle_version");
    localStorage.setItem("celestedle_date", aujourdHui);
    localStorage.removeItem("celestedle_solution");
  }

  fetch("https://celestedle-api.onrender.com/secret-version")
    .then((res) => res.json())
    .then((data) => {
      const versionSauvegardee = localStorage.getItem("celestedle_version");
      if (
        versionSauvegardee &&
        versionSauvegardee !== String(data.secretVersion)
      ) {
        localStorage.removeItem("celestedle_tries");
        localStorage.removeItem("celestedle_gameover");
        localStorage.removeItem("celestedle_status");
        localStorage.removeItem("celestedle_history");
        localStorage.setItem("celestedle_version", data.secretVersion);
        location.reload();
      } else if (!versionSauvegardee) {
        localStorage.setItem("celestedle_version", data.secretVersion);
      }
    });

  let nbTry = parseInt(localStorage.getItem("celestedle_tries")) || 0;
  const tryCountSpan = document.getElementById("try-count");
  if (tryCountSpan) tryCountSpan.textContent = nbTry;

  const isGameOver = localStorage.getItem("celestedle_gameover") === "true";
  const gameStatus = localStorage.getItem("celestedle_status");
  const form = document.getElementById("guess-form");
  const shareBtn = document.getElementById("share-btn");
  const giveupBtn = document.getElementById("giveup-btn");

  const historique =
    JSON.parse(localStorage.getItem("celestedle_history")) || [];
  historique.forEach((data) => {
    ajouterLigneTableau(data);
  });

  // Affichage factorisé de fin de partie (Win / Lose)
  if (isGameOver && form) {
    form.style.display = "none";
    if (giveupBtn) giveupBtn.style.display = "none";
    if (shareBtn) shareBtn.style.display = "block";

    const messageContainer = document.createElement("div");
    const isWin = gameStatus !== "lose";

    messageContainer.className = isWin ? "win-message" : "lose-message";
    const titre = isWin ? "GG ! Victory ! 🎉" : "Nice try... Aba(n)don ! ❌";

    const solution = localStorage.getItem("celestedle_solution") || "Unknown";
    const solutionFormatee =
      solution.charAt(0).toUpperCase() + solution.slice(1);

    const detail = isWin
      ? `You found the secret element in <strong>${nbTry}</strong> tries.`
      : `You didn't find today's celestedle ! The answer was : <strong>${solutionFormatee}</strong>`;

    messageContainer.innerHTML = `
        <h2>${titre}</h2>
        <p>${detail}</p>
    `;

    form.parentNode.insertBefore(messageContainer, form);
  }

  // Système personnalisé de suggestions (Remplace la datalist)
  const suggestionsBox = document.getElementById("element-suggestions");
  const input = document.getElementById("element-input");
  let listeElementsOfficiels = [];
  let indexSelectionne = -1;

  fetch("https://celestedle-api.onrender.com/api/elements")
    .then((res) => res.json())
    .then((elements) => {
      listeElementsOfficiels = elements;
    })
    .catch((err) => console.error("Error loading elements:", err));

  if (input && suggestionsBox) {
    input.addEventListener("input", (e) => {
      const recherche = e.target.value.trim().toLowerCase();
      suggestionsBox.innerHTML = "";
      indexSelectionne = -1; // Réinitialise la sélection à chaque nouvelle frappe

      if (recherche.length === 0) {
        suggestionsBox.style.display = "none";
        return;
      }

      const suggestionsAFiltrer = new Set();

      // 1. RÈGLE 1 : Recherche progressive sur le début d'un synonyme (ex: "pi" pour "piaf")
      Object.keys(synonymes).forEach((syn) => {
        if (syn.startsWith(recherche)) {
          const officiel = synonymes[syn];
          suggestionsAFiltrer.add(
            officiel.charAt(0).toUpperCase() + officiel.slice(1),
          );
        }
      });

      // 2. RÈGLE 2 : Recherche sur les éléments officiels (ex: "bird")
      listeElementsOfficiels.forEach((nom) => {
        if (nom.toLowerCase().includes(recherche)) {
          suggestionsAFiltrer.add(nom.charAt(0).toUpperCase() + nom.slice(1));
        }
      });

      // Rendu des suggestions trouvées
      if (suggestionsAFiltrer.size > 0) {
        suggestionsAFiltrer.forEach((mot) => {
          const div = document.createElement("div");
          div.classList.add("suggestion-item");
          div.textContent = mot;

          div.addEventListener("click", () => {
            validerSuggestion(mot);
          });

          suggestionsBox.appendChild(div);
        });
        suggestionsBox.style.display = "block";
      } else {
        suggestionsBox.style.display = "none";
      }
    });

    // Navigation au clavier (Flèches Haut/Bas + Entrée)
    input.addEventListener("keydown", (e) => {
      const items = suggestionsBox.querySelectorAll(".suggestion-item");
      if (items.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        indexSelectionne++;
        if (indexSelectionne >= items.length) indexSelectionne = 0;
        mettreAJourSelection(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        indexSelectionne--;
        if (indexSelectionne < 0) indexSelectionne = items.length - 1;
        mettreAJourSelection(items);
      } else if (e.key === "Enter") {
        if (indexSelectionne > -1 && items[indexSelectionne]) {
          e.preventDefault();
          validerSuggestion(items[indexSelectionne].textContent);
        }
      }
    });

    function mettreAJourSelection(items) {
      items.forEach((item, idx) => {
        if (idx === indexSelectionne) {
          item.classList.add("selected");
          item.scrollIntoView({ block: "nearest" });
        } else {
          item.classList.remove("selected");
        }
      });
    }

    function validerSuggestion(mot) {
      input.value = mot;
      suggestionsBox.innerHTML = "";
      suggestionsBox.style.display = "none";
      indexSelectionne = -1;
      input.focus();
    }

    // Fermer la boîte si on clique ailleurs sur la page
    document.addEventListener("click", (e) => {
      if (e.target !== input && e.target !== suggestionsBox) {
        suggestionsBox.style.display = "none";
      }
    });
  }

  // Soumission du formulaire
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const inputElement = document.getElementById("element-input");
      let choix = inputElement ? inputElement.value.trim().toLowerCase() : "";

      if (synonymes[choix]) {
        choix = synonymes[choix];
      }

      if (!choix) return;

      fetch("https://celestedle-api.onrender.com/api/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choix }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Invalid entities or server error");
          return res.json();
        })
        .then((data) => {
          const versionSauvegardee = localStorage.getItem("celestedle_version");

          if (
            versionSauvegardee &&
            versionSauvegardee !== String(data.secretVersion)
          ) {
            localStorage.removeItem("celestedle_tries");
            localStorage.removeItem("celestedle_gameover");
            localStorage.removeItem("celestedle_status");
            localStorage.removeItem("celestedle_history");
            localStorage.setItem("celestedle_version", data.secretVersion);
            alert(
              "The secret word has been changed by an admin ! Your tries has been reseted !",
            );
            location.reload();
            return;
          }

          if (!versionSauvegardee) {
            localStorage.setItem("celestedle_version", data.secretVersion);
          }

          nbTry++;
          localStorage.setItem("celestedle_tries", nbTry);
          if (tryCountSpan) tryCountSpan.textContent = nbTry;

          historique.push(data);
          localStorage.setItem(
            "celestedle_history",
            JSON.stringify(historique),
          );

          ajouterLigneTableau(data);
          if (inputElement) inputElement.value = "";
          if (suggestionsBox) suggestionsBox.style.display = "none";

          if (data.verdict.isCorrect) {
            confetti({
              particleCount: 150,
              spread: 80,
              origin: { y: 0.6 },
            });

            localStorage.setItem("celestedle_gameover", "true");
            localStorage.setItem("celestedle_status", "win");
            location.reload();
          }
        })
        .catch((err) => {
          alert("This element does not exist");
          console.error("Erreur submit:", err);
        });
    });
  }

  // Gestion du bouton Rules
  const rulesBtn = document.getElementById("rules-btn");
  if (rulesBtn) {
    rulesBtn.addEventListener("click", () => {
      const rulesModal = document.createElement("div");
      rulesModal.classList.add("rules-modal");

      rulesModal.innerHTML = `
      <div class="rules-content">
        <button class="close-rules-btn">&times;</button>
        <h2>Rules of Celestedle</h2>
        <p>Guess the secret element of the day by entering its name. After each guess, you'll receive feedback on how close your guess is to the secret element based on its type, location, color, and hitbox.</p>
        <h4> What is the difference between the categories ?</h4>
        <ul>
            <li><strong>Collectibles</strong>: These are items that can be collected in the game, such as strawberries or golden strawberries.</li>
            <li><strong>Characters</strong>: These are the characters that appear in the game, such as Theo, Granny, or Oshiro.</li>
            <li><strong>Environments</strong>: These are the entities that does not affect the gameplay, such as Binoculars or Breakable Walls.</li>
            <li><strong>Mechanics</strong>: These are the entities that affects the gameplay, such as crumble blocks or core switchs.</li>
            <li><strong>Movement and propulsion :</strong> These are the entities that the player will use to gain speed or to move in the room, such as moving block or boosters</li>
        </ul>

        <h4>And the colors ?</h4>
        <ul>
          <li><span style="color: var(--color-correct);">🟩 Correct</span>: The guessed attribute matches the secret element's attribute.</li>
          <li><span style="color: var(--color-partial);">🟨 Partial</span>: The guessed attribute is partially correct, i.e. the submitted answer is part of the correct answer. ex: If the correct answer is "Red, Blue" and the guessed attribute is "Red", it would be considered "Partial"</li>
          <li><span style="color: var(--color-notTotallyWrong);">🟧 Not Totally Wrong</span>: The guessed attribute cointains the correct answer, but contains too wrong elements. ex: If the correct answer is "Red" and the guessed attribute is "Red, Blue", it would be considered "Not Totally Wrong"</li>
          <li><span style="color: var(--color-wrong);">🟥 Wrong</span>: The guessed attribute is incorrect.</li>
        </ul>
        <p>You have unlimited tries, but you can choose to forfeit if you give up. Good luck!</p>
      </div>
    `;

      rulesModal.addEventListener("click", (e) => {
        if (
          e.target === rulesModal ||
          e.target.classList.contains("close-rules-btn")
        ) {
          rulesModal.remove();
        }
      });

      document.body.appendChild(rulesModal);
    });
  }

  // Gestion du bouton Give Up
  if (giveupBtn) {
    giveupBtn.addEventListener("click", () => {
      if (!confirm("Are you sure you want to give up?")) return;

      fetch("https://celestedle-api.onrender.com/api/getSecretWord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Server error during forfeit");
          return res.json();
        })
        .then((data) => {
          localStorage.setItem("celestedle_gameover", "true");
          localStorage.setItem("celestedle_status", "lose");

          if (data.secretElement) {
            localStorage.setItem("celestedle_solution", data.secretElement);
          }
          location.reload();
        })
        .catch((err) => {
          console.error("Error during give up:", err);
          localStorage.setItem("celestedle_gameover", "true");
          localStorage.setItem("celestedle_status", "lose");
          location.reload();
        });
    });
  }

  // Gestion du bouton Partager
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const isWin = localStorage.getItem("celestedle_status") !== "lose";

      let textePartage = isWin
        ? `Celestedle of the day in ${nbTry} tries\n\n`
        : `Celestedle of the day : Aba(n)don ❌ (${nbTry} tries)\n\n`;

      const conversionScore = {
        correct: "🟩",
        partial: "🟨",
        notTotallyWrong: "🟧",
        wrong: "🟥",
      };

      historique.forEach((tryData) => {
        if (!tryData.verdict) return;
        const iconType = conversionScore[tryData.verdict.type] || "🟥";
        const iconLieu = conversionScore[tryData.verdict.lieu] || "🟥";
        const iconCouleur = conversionScore[tryData.verdict.couleur] || "🟥";
        const iconHitbox = conversionScore[tryData.verdict.hitbox] || "🟥";
        textePartage += `${iconType}${iconLieu}${iconCouleur}${iconHitbox}\n`;
      });

      navigator.clipboard
        .writeText(textePartage + "\nhttps://celestedle.vercel.app/")
        .then(() => {
          shareBtn.textContent = "Copied !";
          setTimeout(() => {
            shareBtn.textContent = "Share result";
          }, 2000);
        })
        .catch((err) => console.error("Error, can't copy", err));
    });
  }
});

// Fonctions globales Admin
window.getSecretWordPlzUwU = function () {
  const mdp = prompt("Please enter admin password :");
  if (!mdp) return;

  fetch("https://celestedle-api.onrender.com/api/admin/verifier-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: mdp }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("incorrect password");
      return res.json();
    })
    .then(() => {
      fetch("https://celestedle-api.onrender.com/api/getSecretWord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => res.json())
        .then((data) => {
          alert("The secret element of the day is : " + data.secretElement);
        })
        .catch((err) => console.error("Error fetching secret word:", err));
    })
    .catch((err) => alert(err.message));
};

window.forceReset = function () {
  const mdp = prompt("Please enter admin password :");
  if (!mdp) return;

  fetch("https://celestedle-api.onrender.com/api/admin/verifier-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: mdp }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("incorrect password");
      return res.json();
    })
    .then(() => {
      localStorage.removeItem("celestedle_tries");
      localStorage.removeItem("celestedle_gameover");
      localStorage.removeItem("celestedle_status");
      localStorage.removeItem("celestedle_history");
      localStorage.removeItem("celestedle_date");
      localStorage.removeItem("celestedle_version");
      alert("Local data reset ! Please reload page");
    })
    .catch((err) => alert(err.message));
};

window.randomSecret = function (reset = false) {
  const mdp = prompt("Please enter admin password:");
  if (!mdp) return;
  let newHash = Math.random() * 1000000000;
  newHash = Math.floor(newHash);
  if (reset) newHash = null;

  fetch("https://celestedle-api.onrender.com/api/admin/random-Hash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: mdp, newHash: newHash }),
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
  cellNom.className = data.verdict?.isCorrect ? "correct" : "wrong";
  row.appendChild(cellNom);

  const cellType = document.createElement("td");
  cellType.textContent = data.valeurs?.type || "-";
  cellType.className = data.verdict?.type || "wrong";
  row.appendChild(cellType);

  const cellLieu = document.createElement("td");
  cellLieu.textContent = data.valeurs?.lieu || "-";
  cellLieu.className = data.verdict?.lieu || "wrong";
  row.appendChild(cellLieu);

  const cellCouleur = document.createElement("td");
  cellCouleur.textContent = data.valeurs?.couleur || "-";
  cellCouleur.className = data.verdict?.couleur || "wrong";
  row.appendChild(cellCouleur);

  const cellHitbox = document.createElement("td");
  cellHitbox.textContent = data.valeurs?.hitbox || "-";
  cellHitbox.className = data.verdict?.hitbox || "wrong";
  row.appendChild(cellHitbox);

  tbody.insertBefore(row, tbody.firstChild);
}
