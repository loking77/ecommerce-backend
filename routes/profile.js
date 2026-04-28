const express = require("express");
const Profile = require("../models/Profile");
const auth = require("../middleware/auth");

const router = express.Router();

// Voir son profil livraison
router.get("/", auth, async (req, res) => {
  try {
    let profile = await Profile.findOne({ userId: req.user.id });

    if (!profile) {
      profile = new Profile({
        userId: req.user.id,
        firstName: "",
        lastName: "",
        phone: "",
        address: "",
        city: "",
        postalCode: "",
        country: "France"
      });

      await profile.save();
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Modifier son profil livraison
router.put("/", auth, async (req, res) => {
  try {
    const updatedProfile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      req.body,
      { new: true, upsert: true }
    );

    res.json(updatedProfile);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;