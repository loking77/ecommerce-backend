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

router.post("/", auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Panier vide" });
    }

    const validItems = cart.items.filter(item => item.productId);

    const items = validItems.map(item => ({
      productId: item.productId._id,
      name: item.productId.name,
      image: item.productId.image,
      price: item.productId.price,
      quantity: item.quantity
    }));

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const selectedShipping = req.body.shipping || {
      carrier: "Standard",
      service: "Livraison standard",
      price: subtotal >= 100 ? 0 : 4.99,
      delay: "3-5 jours"
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
        shippedAt: null
      },
      total,
      status: "En attente",
      delivery: profile ? {
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        phone: profile.phone || "",
        address: profile.address || "",
        city: profile.city || "",
        postalCode: profile.postalCode || "",
        country: profile.country || ""
      } : {}
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

router.get("/my", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(orders);
});

router.get("/", auth, adminOnly, async (req, res) => {
  const orders = await Order.find()
    .populate("userId", "name email role")
    .sort({ createdAt: -1 });

  res.json(orders);
});

router.patch("/:id/status", auth, adminOnly, async (req, res) => {
  const { status, trackingNumber, trackingUrl } = req.body;

  const updateData = {
    status
  };

  if (status === "Expédiée") {
    updateData.tracking = {
      number: trackingNumber || "",
      url: trackingUrl || "",
      shippedAt: new Date()
    };
  }

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  );

  res.json(order);
});

router.patch("/:id/tracking", auth, adminOnly, async (req, res) => {
  const { trackingNumber, trackingUrl } = req.body;

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      tracking: {
        number: trackingNumber || "",
        url: trackingUrl || "",
        shippedAt: new Date()
      },
      status: "Expédiée"
    },
    { new: true }
  );

  res.json(order);
});

router.get("/admin/users", auth, adminOnly, async (req, res) => {
  const users = await User.find()
    .select("-password -resetToken -resetTokenExpire")
    .sort({ createdAt: -1 });

  res.json(users);
});

module.exports = router;