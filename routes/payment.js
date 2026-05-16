const express = require("express");
const Stripe = require("stripe");
const auth = require("../middleware/auth");
const Cart = require("../models/Cart");
const Profile = require("../models/Profile");
const Order = require("../models/Order");
const Product = require("../models/Product");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ---------------- CREATE CHECKOUT SESSION ---------------- */

router.post(
  "/create-checkout-session",
  express.json(),
  auth,
  async (req, res) => {
    try {
      const { shipping } = req.body;

      const cart = await Cart.findOne({ userId: req.user.id }).populate(
        "items.productId"
      );

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ message: "Panier vide" });
      }

      const validItems = cart.items.filter((item) => item.productId);

      if (validItems.length === 0) {
        return res.status(400).json({
          message: "Aucun produit valide dans le panier",
        });
      }

      const orderItemsForMetadata = validItems.map((item) => ({
        productId: String(item.productId._id),
        name: item.productId.name,
        image: item.productId.image || "",
        price: Number(item.productId.price || 0),
        quantity: Number(item.quantity || 1),
        selectedColor: item.selectedColor || "",
        selectedSize: item.selectedSize || "",
      }));

      const line_items = validItems.map((item) => ({
        price_data: {
          currency: "eur",
          product_data: {
            name: item.productId.name,
          },
          unit_amount: Math.round(Number(item.productId.price || 0) * 100),
        },
        quantity: Number(item.quantity || 1),
      }));

      if (shipping && Number(shipping.price) > 0) {
        line_items.push({
          price_data: {
            currency: "eur",
            product_data: {
              name: `Livraison - ${shipping.carrier || "Livraison"}`,
            },
            unit_amount: Math.round(Number(shipping.price || 0) * 100),
          },
          quantity: 1,
        });
      }

      const clientUrl =
        process.env.CLIENT_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items,
        mode: "payment",
        success_url: `${clientUrl}/success`,
        cancel_url: `${clientUrl}`,
        metadata: {
          userId: String(req.user.id),
          shipping: JSON.stringify(shipping || {}),
          items: JSON.stringify(orderItemsForMetadata),
        },
      });

      res.json({ url: session.url });
    } catch (err) {
      console.log("ERREUR STRIPE :", err.message);
      res.status(500).json({
        message: "Erreur paiement",
        error: err.message,
      });
    }
  }
);

/* ---------------- STRIPE WEBHOOK ---------------- */

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
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
          "payment.stripeSessionId": session.id,
        });

        if (existingOrder) {
          return res.json({ received: true });
        }

        const userId = session.metadata?.userId;

        let shipping = {};
        let itemsFromMetadata = [];

        try {
          shipping = JSON.parse(session.metadata?.shipping || "{}");
        } catch {
          shipping = {};
        }

        try {
          itemsFromMetadata = JSON.parse(session.metadata?.items || "[]");
        } catch {
          itemsFromMetadata = [];
        }

        const safeShipping = {
          carrier: shipping?.carrier || "",
          service: shipping?.service || "",
          price: Number(shipping?.price || 0),
          delay: shipping?.delay || "",
          type: shipping?.type || "",
        };

        if (!userId) {
          return res.json({ received: true });
        }

        let items = itemsFromMetadata;

        const cart = await Cart.findOne({ userId }).populate("items.productId");
        const profile = await Profile.findOne({ userId });

        if ((!items || items.length === 0) && cart && cart.items.length > 0) {
          const validItems = cart.items.filter((item) => item.productId);

          items = validItems.map((item) => ({
            productId: item.productId._id,
            name: item.productId.name,
            image: item.productId.image || "",
            price: Number(item.productId.price || 0),
            quantity: Number(item.quantity || 1),
            selectedColor: item.selectedColor || "",
            selectedSize: item.selectedSize || "",
          }));
        }

        if (!items || items.length === 0) {
          return res.json({ received: true });
        }

        const subtotal = items.reduce(
          (sum, item) =>
            sum + Number(item.price || 0) * Number(item.quantity || 1),
          0
        );

        const total = Number(
          (subtotal + Number(safeShipping.price || 0)).toFixed(2)
        );

        const order = new Order({
          userId,
          items,
          subtotal,
          shipping: safeShipping,
          total,
          payment: {
            stripeSessionId: session.id,
            status: "paid",
          },
          tracking: {
            number: "",
            url: "",
            shippedAt: null,
          },
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

        for (const item of items) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: {
              sold: Number(item.quantity || 1),
              stock: -Number(item.quantity || 1),
            },
          });
        }

        if (cart) {
          cart.items = [];
          await cart.save();
        }

        console.log("COMMANDE CRÉÉE APRÈS PAIEMENT ✅");
      } catch (err) {
        console.log("ERREUR WEBHOOK ORDER :", err.message);
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;