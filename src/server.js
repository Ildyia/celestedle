const express = require("express");
const cors = require("cors");
const path = require("path");
const gameRoutes = require("./routes/game");
const adminRoutes = require("./routes/admin");
const reportRoutes = require("./routes/report");
const bot = require("./utils/bot");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/db.json", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "db.json"));
});

app.use(express.static(path.join(__dirname, "../public")));

app.use("/", gameRoutes);
app.use("/admin", adminRoutes);
app.use("/report-bug", reportRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server successfully started running on port ${PORT}`);
});
