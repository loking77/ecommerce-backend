const express = require("express");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Profile = require("../models/Profile");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin uniquement" });
  }
  next();
};

/* CRÉER COMMANDE MANUELLE */
router.post("/", auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Panier vide" });
    }

    const validItems = cart.items.filter((item) => item.productId);

    const items = validItems.map((item) => ({
      productId: item.productId._id,
      name: item.productId.name,
      image: item.productId.image,
      price: item.productId.price,
      quantity: item.quantity,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const selectedShipping = req.body.shipping || {
      carrier: "Standard",
      service: "Livraison standard",
      price: subtotal >= 100 ? 0 : 4.99,
      delay: "3-5 jours",
      type: "delivery",
    };

    const total = subtotal + Number(selectedShipping.price || 0);

    const profile = await Profile.findOne({ userId: req.user.id });

    const order = new Order({
      userId: req.user.id,
      items,
      subtotal,
      shipping: selectedShipping,
      tracking: {
        number: "",
        url: "",
        shippedAt: null,
      },
      total,
      status: "En attente",
      delivery: profile
        ? {
            firstName: profile.firstName || "",
            lastName: profile.lastName || "",
            phone: profile.phone || "",
            address: profile.address || "",
            city: profile.city || "",
            postalCode: profile.postalCode || "",
            country: profile.country || "",
          }
        : {},
    });

    await order.save();

    cart.items = [];
    await cart.save();

    res.json({ message: "Commande créée", order });
  } catch (err) {
    console.log("ERREUR COMMANDE :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

/* COMMANDES DU CLIENT */
router.get("/my", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Erreur chargement commandes" });
  }
});

/* DEMANDE CLIENT : ANNULATION / RETOUR / REMBOURSEMENT / MESSAGE */
router.post("/:id/request", auth, async (req, res) => {
  try {
    const { type, reason, message } = req.body;

    const allowedTypes = ["cancel", "refund", "return"];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ message: "Type de demande invalide" });
    }

    if (!reason || !message) {
      return res.status(400).json({ message: "Raison et message obligatoires" });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    if (order.customerRequest?.status === "pending") {
      return res.status(400).json({
        message: "Tu as déjà une demande en attente sur cette commande",
      });
    }

    order.customerRequest = {
      type,
      reason,
      message,
      status: "pending",
      createdAt: new Date(),
      adminReply: "",
    };

    order.sellerMessages.push({
      from: "client",
      message,
      createdAt: new Date(),
    });

    await order.save();

    res.json({
      message: "Demande envoyée au vendeur",
      order,
    });
  } catch (err) {
    console.log("ERREUR DEMANDE CLIENT :", err.message);
    res.status(500).json({ message: "Erreur demande client" });
  }
});

/* TOUTES LES COMMANDES ADMIN */
router.get("/", auth, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userId", "name email role")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Erreur chargement admin commandes" });
  }
});

/* CHANGER STATUT ADMIN */
router.patch("/:id/status", auth, adminOnly, async (req, res) => {
  try {
    const { status, trackingNumber, trackingUrl } = req.body;

    const updateData = { status };

    if (status === "Expédiée") {
      updateData.tracking = {
        number: trackingNumber || "",
        url: trackingUrl || "",
        shippedAt: new Date(),
      };
    }

    const order = await Order.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Erreur changement statut" });
  }
});

/* TRACKING ADMIN */
router.patch("/:id/tracking", auth, adminOnly, async (req, res) => {
  try {
    const { trackingNumber, trackingUrl } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        tracking: {
          number: trackingNumber || "",
          url: trackingUrl || "",
          shippedAt: new Date(),
        },
        status: "Expédiée",
      },
      { new: true }
    );

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Erreur suivi commande" });
  }
});

/* RÉPONSE ADMIN À UNE DEMANDE CLIENT */
router.patch("/:id/request", auth, adminOnly, async (req, res) => {
  try {
    const { decision, adminReply } = req.body;

    if (!["accepted", "refused"].includes(decision)) {
      return res.status(400).json({ message: "Décision invalide" });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    order.customerRequest.status = decision;
    order.customerRequest.adminReply = adminReply || "";

    order.sellerMessages.push({
      from: "admin",
      message: adminReply || (decision === "accepted" ? "Demande acceptée" : "Demande refusée"),
      createdAt: new Date(),
    });

    if (decision === "accepted" && order.customerRequest.type === "cancel") {
      order.status = "Annulée";
    }

    await order.save();

    res.json({
      message: "Réponse envoyée au client",
      order,
    });
  } catch (err) {
    console.log("ERREUR RÉPONSE ADMIN :", err.message);
    res.status(500).json({ message: "Erreur réponse admin" });
  }
});

/* UTILISATEURS ADMIN */
router.get("/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find()
      .select("-password -resetToken -resetTokenExpire")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Erreur utilisateurs" });
  }
});

module.exports = router;