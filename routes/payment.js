const express = require("express");
const Stripe = require("stripe");
const auth = require("../middleware/auth");
const Cart = require("../models/Cart");
const Profile = require("../models/Profile");
const Order = require("../models/Order");
const Product = require("../models/Product");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/create-checkout-session", auth, async (req, res) => {
  try {
    const { shipping } = req.body;

    const cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Panier vide" });
    }

    const validItems = cart.items.filter(item => item.productId);

    const line_items = validItems.map(item => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: item.productId.name
        },
        unit_amount: Math.round(Number(item.productId.price) * 100)
      },
      quantity: item.quantity
    }));

    if (shipping && Number(shipping.price) > 0) {
      line_items.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: `Livraison - ${shipping.carrier}`
          },
          unit_amount: Math.round(Number(shipping.price) * 100)
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000",
      metadata: {
        userId: req.user.id,
        shipping: JSON.stringify(shipping || {})
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log("ERREUR STRIPE :", err.message);
    res.status(500).json({ message: "Erreur paiement", error: err.message });
  }
});

router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("WEBHOOK SIGNATURE ERROR :", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    try {
      const existingOrder = await Order.findOne({
        "payment.stripeSessionId": session.id
      });

      if (existingOrder) {
        return res.json({ received: true });
      }

      const userId = session.metadata.userId;
      const shipping = JSON.parse(session.metadata.shipping || "{}");

      const cart = await Cart.findOne({ userId }).populate("items.productId");
      const profile = await Profile.findOne({ userId });

      if (!cart || cart.items.length === 0) {
        return res.json({ received: true });
      }

      const validItems = cart.items.filter(item => item.productId);

      const items = validItems.map(item => ({
        productId: item.productId._id,
        name: item.productId.name,
        image: item.productId.image,
        price: item.productId.price,
        quantity: item.quantity
      }));

      const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const total = Number(
        (subtotal + Number(shipping.price || 0)).toFixed(2)
      );

      const order = new Order({
        userId,
        items,
        subtotal,
        shipping,
        total,
        payment: {
          stripeSessionId: session.id,
          status: "paid"
        },
        tracking: {
          number: "",
          url: "",
          shippedAt: null
        },
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

      for (const item of items) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: {
            sold: item.quantity,
            stock: -item.quantity
          }
        });
      }

      cart.items = [];
      await cart.save();

      console.log("COMMANDE CRÉÉE APRÈS PAIEMENT ✅");
    } catch (err) {
      console.log("ERREUR WEBHOOK ORDER :", err.message);
    }
  }

  res.json({ received: true });
});

module.exports = router;