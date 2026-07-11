require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const gameRoutes = require("./routes/game");
const adminRoutes = require("./routes/admin");
const { connectDB } = require("./utils/db"); // <-- AJOUT
const { loadElementsFromDB } = require("./utils/helpers");

const app = express();
app.use((req, res, next) => {
  console.log(`[Requête reçue] : ${req.method} ${req.url}`);
  next();
});

//TODO: remove debug prompts in server and game.js before production deployment

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../public")));

app.use("/", gameRoutes);
app.use("/admin", adminRoutes);

const PORT = process.env.PORT || 3000;

const { initDailyCron } = require("./utils/cronWord");
// Connecter la DB avant de lancer Express
connectDB()
  .then(async (db) => {
    // <-- Ajoute async ici et récupère l'instance db
    await loadElementsFromDB(db);
    app.listen(PORT, () => {
      console.log(`Server successfully started running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Server startup failed due to database connection error:", err);
  });
