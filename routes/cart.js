const express = require("express");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const auth = require("../middleware/auth");

const router = express.Router();

// VOIR PANIER
router.get("/", auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");

    if (!cart) {
      cart = new Cart({
        userId: req.user.id,
        items: [],
      });
      await cart.save();
    }

    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// AJOUTER PRODUIT
router.post("/add", auth, async (req, res) => {
  try {
    const { productId } = req.body;

    // Compteur "intéressés"
    await Product.findByIdAndUpdate(productId, {
      $inc: { cartAdds: 1 },
    });

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
      cart = new Cart({
        userId: req.user.id,
        items: [],
      });
    }

    const item = cart.items.find(
      (item) => item.productId.toString() === productId
    );

    if (item) {
      item.quantity += 1;
    } else {
      cart.items.push({
        productId,
        quantity: 1,
      });
    }

    await cart.save();

    cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");

    res.json(cart);
  } catch (err) {
    console.log("ERREUR AJOUT PANIER :", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// DIMINUER QUANTITÉ
router.patch("/decrease/:productId", auth, async (req, res) => {
  try {
    const { productId } = req.params;

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
      return res.status(404).json({ message: "Panier non trouvé" });
    }

    const item = cart.items.find(
      (item) => item.productId.toString() === productId
    );

    if (!item) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    if (item.quantity > 1) {
      item.quantity -= 1;
    } else {
      cart.items = cart.items.filter(
        (item) => item.productId.toString() !== productId
      );
    }

    await cart.save();

    cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");

    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// SUPPRIMER PRODUIT COMPLET
router.delete("/remove/:productId", auth, async (req, res) => {
  try {
    const { productId } = req.params;

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
      return res.status(404).json({ message: "Panier non trouvé" });
    }

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId
    );

    await cart.save();

    cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");

    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// VIDER PANIER
router.delete("/clear", auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user.id });

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    res.json({ message: "Panier vidé" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;