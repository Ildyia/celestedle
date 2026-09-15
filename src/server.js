require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require('fs');
const cookieParser = require("cookie-parser");

const { getEntitySprite } = require("./utils/helpers");

const app = express();

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://celestedle.vercel.app",
  "https://celestedle-beta.vercel.app"
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        ALLOWED_ORIGINS.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const gameRoutes = require("./routes/game");
const adminRoutes = require("./routes/admin");
const reportRoutes = require("./routes/report");
const bot = require("./utils/bot");

app.get("/db.json", (_, res) => {
  res.sendFile(path.join(__dirname, "..", "db.json"));
});

app.get("/sprite/:name", (req, res) => {
  const mappedName = getEntitySprite(req.params.name);
  const fileName = path.join(__dirname, "../public", mappedName ?? "");
  if (mappedName && fs.existsSync(fileName))
    res.sendFile(fileName);
  else
    res.sendFile(path.join(__dirname, "../public/assets/placeholder.svg"))
});

app.use("/", gameRoutes);
app.use("/admin", adminRoutes);
app.use("/report-bug", reportRoutes);

app.use((_, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server successfully started running on port ${PORT}`);
});
