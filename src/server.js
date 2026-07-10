const express = require("express");
const cors = require("cors");
const path = require("path");
const gameRoutes = require("./routes/game");
const adminRoutes = require("./routes/admin");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../public")));

app.use("/", gameRoutes);
app.use("/admin", adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server successfully started running on port ${PORT}`);
});