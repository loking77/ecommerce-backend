const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

const router = express.Router();

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  "http://localhost:3000";

const SERVER_URL =
  process.env.SERVER_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:5000";

const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY";

/* ---------------- GOOGLE STRATEGY ---------------- */

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${SERVER_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName || email;

        if (!email) {
          return done(null, false);
        }

        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            name,
            email,
            password: "GOOGLE_AUTH_USER",
            role: "user",
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

/* ---------------- REGISTER ---------------- */

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "Email déjà utilisé" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: "user",
    });

    await user.save();

    res.json({ message: "Utilisateur créé" });
  } catch (err) {
    console.log("Erreur register :", err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

/* ---------------- LOGIN ---------------- */

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Utilisateur introuvable" });
    }

    if (!user.password || user.password === "GOOGLE_AUTH_USER") {
      return res.status(400).json({
        message: "Ce compte utilise Google. Connecte-toi avec Google.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Mot de passe incorrect" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.log("Erreur login :", err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

/* ---------------- GOOGLE AUTH ---------------- */

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/`,
    session: false,
  }),
  (req, res) => {
    const token = jwt.sign(
      {
        id: req.user._id,
        role: req.user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userData = encodeURIComponent(
      JSON.stringify({
        id: req.user._id,
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      })
    );

    res.redirect(`${FRONTEND_URL}/?token=${token}&user=${userData}`);
  }
);

/* ---------------- FORGOT PASSWORD ---------------- */

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Utilisateur introuvable" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetToken = resetToken;
    user.resetTokenExpire = Date.now() + 15 * 60 * 1000;

    await user.save();

    const resetLink = `${FRONTEND_URL}/reset-password/${resetToken}`;

    console.log("Lien reset password :", resetLink);

    res.json({
      message: "Lien de récupération généré.",
      resetLink,
    });
  } catch (err) {
    console.log("Erreur forgot password :", err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

/* ---------------- RESET PASSWORD ---------------- */

router.post("/reset-password/:token", async (req, res) => {
  try {
    const { password } = req.body;
    const { token } = req.params;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Lien invalide ou expiré" });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;

    await user.save();

    res.json({ message: "Mot de passe modifié avec succès" });
  } catch (err) {
    console.log("Erreur reset password :", err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

/* ---------------- MAKE ADMIN TEMP ---------------- */

router.patch("/make-admin", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOneAndUpdate(
      { email },
      { role: "admin" },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    res.json({
      message: "Utilisateur passé en admin",
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.log("Erreur make-admin :", err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;