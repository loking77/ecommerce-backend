const express = require("express");
const PushToken = require("../models/PushToken");
const auth = require("../middleware/auth");

const router = express.Router();

router.post("/save-token", auth, async (req, res) => {
  try {
    const { token, platform = "web" } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token manquant" });
    }

    await PushToken.findOneAndUpdate(
      { token },
      {
        userId: req.user.id,
        token,
        platform,
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Token notification enregistré" });
  } catch (err) {
    console.log("ERREUR SAVE PUSH TOKEN :", err.message);
    res.status(500).json({ message: "Erreur token notification" });
  }
});

module.exports = router;