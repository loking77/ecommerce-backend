const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const PDFDocument = require("pdfkit");

const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Profile = require("../models/Profile");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

/* ---------------- MULTER + CLOUDINARY SAV ---------------- */

const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadSupportImageToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "ecommerce/support-messages" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

/* ---------------- ADMIN ONLY ---------------- */

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin uniquement" });
  }
  next();
};

const formatPrice = (price) => Number(price || 0).toFixed(2).replace(".", ",");

/* ---------------- CRÉER COMMANDE MANUELLE ---------------- */

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
      tracking: { number: "", url: "", shippedAt: null },
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

/* ---------------- COMMANDES DU CLIENT ---------------- */

router.get("/my", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Erreur chargement commandes" });
  }
});

/* ---------------- FACTURE PDF ---------------- */

router.get("/:id/invoice", auth, async (req, res) => {
  try {
    const query =
      req.user.role === "admin"
        ? { _id: req.params.id }
        : { _id: req.params.id, userId: req.user.id };

    const order = await Order.findOne(query).populate("userId", "name email");

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const doc = new PDFDocument({ margin: 50 });

    const invoiceNumber = `FACT-${order._id.toString().slice(-8).toUpperCase()}`;
    const fileName = `facture-${order._id.toString().slice(-6)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    doc.pipe(res);

    doc
      .fontSize(24)
      .fillColor("#111827")
      .text("TA SHOP DU 78", { align: "left" });

    doc
      .fontSize(10)
      .fillColor("#6b7280")
      .text("Streetwear, sneakers et bons plans.")
      .moveDown(2);

    doc
      .fontSize(18)
      .fillColor("#4f46e5")
      .text("FACTURE", { align: "right" });

    doc
      .fontSize(10)
      .fillColor("#111827")
      .text(`Numéro : ${invoiceNumber}`, { align: "right" })
      .text(`Date : ${new Date(order.createdAt).toLocaleDateString("fr-FR")}`, {
        align: "right",
      })
      .moveDown(2);

    doc
      .fontSize(12)
      .fillColor("#111827")
      .text("Client", { underline: true })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor("#374151")
      .text(order.userId?.name || `${order.delivery?.firstName || ""} ${order.delivery?.lastName || ""}`)
      .text(order.userId?.email || "Email non renseigné")
      .text(order.delivery?.address || "")
      .text(`${order.delivery?.postalCode || ""} ${order.delivery?.city || ""}`)
      .text(order.delivery?.country || "")
      .moveDown(2);

    doc
      .fontSize(12)
      .fillColor("#111827")
      .text("Détails de la commande", { underline: true })
      .moveDown(1);

    const tableTop = doc.y;
    const itemX = 50;
    const qtyX = 310;
    const priceX = 380;
    const totalX = 470;

    doc
      .fontSize(10)
      .fillColor("#111827")
      .text("Produit", itemX, tableTop)
      .text("Qté", qtyX, tableTop)
      .text("Prix", priceX, tableTop)
      .text("Total", totalX, tableTop);

    doc
      .moveTo(50, tableTop + 18)
      .lineTo(550, tableTop + 18)
      .strokeColor("#e5e7eb")
      .stroke();

    let y = tableTop + 32;

    order.items.forEach((item) => {
      const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);

      doc
        .fontSize(10)
        .fillColor("#374151")
        .text(item.name || "Produit", itemX, y, { width: 240 })
        .text(String(item.quantity || 1), qtyX, y)
        .text(`${formatPrice(item.price)} EUR`, priceX, y)
        .text(`${formatPrice(lineTotal)} EUR`, totalX, y);

      y += 28;
    });

    doc
      .moveTo(50, y)
      .lineTo(550, y)
      .strokeColor("#e5e7eb")
      .stroke();

    y += 20;

    doc
      .fontSize(10)
      .fillColor("#111827")
      .text(`Sous-total : ${formatPrice(order.subtotal)} EUR`, 370, y, {
        align: "right",
      });

    y += 18;

    doc.text(`Livraison : ${formatPrice(order.shipping?.price)} EUR`, 370, y, {
      align: "right",
    });

    y += 24;

    doc
      .fontSize(14)
      .fillColor("#4f46e5")
      .text(`Total payé : ${formatPrice(order.total)} EUR`, 370, y, {
        align: "right",
      });

    doc.moveDown(3);

    doc
      .fontSize(10)
      .fillColor("#6b7280")
      .text(`Mode de livraison : ${order.shipping?.carrier || "Non défini"} - ${order.shipping?.service || ""}`)
      .text(`Statut : ${order.status || "En attente"}`)
      .moveDown(2);

    doc
      .fontSize(9)
      .fillColor("#9ca3af")
      .text("Merci pour ta commande chez TA SHOP DU 78.", {
        align: "center",
      });

    doc.end();
  } catch (err) {
    console.log("ERREUR FACTURE :", err.message);
    res.status(500).json({ message: "Erreur génération facture" });
  }
});

/* ---------------- DEMANDE CLIENT ---------------- */

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

    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });

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

    order.supportMessages.push({
      sender: "client",
      text: message,
      image: "",
      createdAt: new Date(),
    });

    await order.save();

    res.json({ message: "Demande envoyée au vendeur", order });
  } catch (err) {
    console.log("ERREUR DEMANDE CLIENT :", err.message);
    res.status(500).json({ message: "Erreur demande client" });
  }
});

/* ---------------- MESSAGE SAV AVEC IMAGE ---------------- */

router.post("/:id/support-message", auth, upload.single("image"), async (req, res) => {
  try {
    const { text } = req.body;
    let imageUrl = "";

    if (req.file) {
      imageUrl = await uploadSupportImageToCloudinary(req.file.buffer);
    }

    if (!text && !imageUrl) {
      return res.status(400).json({ message: "Message ou image obligatoire" });
    }

    const query =
      req.user.role === "admin"
        ? { _id: req.params.id }
        : { _id: req.params.id, userId: req.user.id };

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    order.supportMessages.push({
      sender: req.user.role === "admin" ? "admin" : "client",
      text: text || "",
      image: imageUrl,
      createdAt: new Date(),
    });

    await order.save();

    res.json({ message: "Message envoyé", order });
  } catch (err) {
    console.log("ERREUR MESSAGE SAV :", err.message);
    res.status(500).json({ message: "Erreur message SAV" });
  }
});

/* ---------------- ADMIN COMMANDES ---------------- */

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

/* ---------------- ADMIN STATUT ---------------- */

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

/* ---------------- ADMIN TRACKING ---------------- */

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

/* ---------------- ADMIN RÉPONSE DEMANDE ---------------- */

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

    order.supportMessages.push({
      sender: "admin",
      text:
        adminReply ||
        (decision === "accepted" ? "Demande acceptée" : "Demande refusée"),
      image: "",
      createdAt: new Date(),
    });

    if (decision === "accepted" && order.customerRequest.type === "cancel") {
      order.status = "Annulée";
    }

    await order.save();

    res.json({ message: "Réponse envoyée au client", order });
  } catch (err) {
    console.log("ERREUR RÉPONSE ADMIN :", err.message);
    res.status(500).json({ message: "Erreur réponse admin" });
  }
});

/* ---------------- ADMIN USERS ---------------- */

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