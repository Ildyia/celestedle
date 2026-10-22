const express = require("express");
const elementsRepo = require("../../repositories/elements");

const router = express.Router();

// Liste pour les suggestions et le formulaire de report
router.get("/elements", (req, res) => {
  res.json(
    elementsRepo.listActive().map(({ nom, couleur, sprite }) => ({ nom, couleur, sprite }))
  );
});

// Synonymes officiels : { "red bubble": "red booster", … }
router.get("/aliases", (req, res) => {
  res.json(elementsRepo.listAliases());
});

module.exports = router;
