const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const PDFDocument = require("pdfkit");
const admin = require("firebase-admin");

const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Profile = require("../models/Profile");
const User = require("../models/User");
const PushToken = require("../models/PushToken");
const auth = require("../middleware/auth");
const { sendMail, buildMailTemplate } = require("../utils/mailer");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

const FRONTEND_URL =
  process.env.CLIENT_URL ||
  process.env.FRONTEND_URL ||
  "https://tashopdu78.netlify.app";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const sendPushToUser = async (
  userId,
  title,
  body,
  url = `${FRONTEND_URL}/orders`
) => {
  try {
    const tokens = await PushToken.find({ userId });

    if (!tokens.length) {
      console.log("Aucun token push pour cet utilisateur");
      return;
    }

    await admin.messaging().sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: {
        title,
        body,
      },
      webpush: {
        fcmOptions: {
          link: url,
        },
        notification: {
          icon: "/logo192.png",
          badge: "/logo192.png",
        },
      },
    });

    console.log("Notification push envoyée ✅");
  } catch (err) {
    console.log("ERREUR PUSH :", err.message);
  }
};

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
    const cart = await Cart.findOne({ userId: req.user.id }).populate(
      "items.productId"
    );

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
      selectedColor: item.selectedColor || "",
      selectedSize: item.selectedSize || "",
    }));

    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

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

    const user = await User.findById(req.user.id);

    await sendMail({
      to: user?.email,
      subject: "✅ Commande confirmée - TA SHOP DU 78",
      html: buildMailTemplate({
        title: "Commande confirmée ✅",
        subtitle: "Merci pour ton achat chez TA SHOP DU 78.",
        badge: "COMMANDE VALIDÉE",
        content: `
          <p>Ta commande a bien été enregistrée.</p>
          <p><strong>Commande :</strong> #${order._id
            .toString()
            .slice(-6)
            .toUpperCase()}</p>
          <p><strong>Total :</strong> ${formatPrice(order.total)} €</p>
          <p>Ta facture est disponible dans ton espace client.</p>
        `,
        buttonText: "Voir mes commandes",
        buttonUrl: `${FRONTEND_URL}/orders`,
      }),
    });

    res.json({ message: "Commande créée", order });
  } catch (err) {
    console.log("ERREUR COMMANDE :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

/* ---------------- COMMANDES DU CLIENT ---------------- */

router.get("/my", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Erreur chargement commandes" });
  }
});

/* ---------------- MARQUER MESSAGES SAV COMME LUS ---------------- */

router.patch("/:id/read-support", auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";

    const query = isAdmin
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.user.id };

    const order = await Order.findOne(query).populate("userId", "name email role");

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    order.supportMessages.forEach((msg) => {
      if (isAdmin && msg.sender === "client") msg.readByAdmin = true;
      if (!isAdmin && msg.sender === "admin") msg.readByClient = true;
    });

    if (isAdmin) order.unreadAdminCount = 0;
    else order.unreadClientCount = 0;

    await order.save();

    const updatedOrder = await Order.findById(order._id).populate(
      "userId",
      "name email role"
    );

    const io = req.app.get("io");

    io?.to(`order-${order._id}`).emit("support-message", {
      order: updatedOrder,
      sender: isAdmin ? "admin" : "client",
      type: "read",
    });

    res.json(updatedOrder);
  } catch (err) {
    console.log("ERREUR READ SUPPORT :", err.message);
    res.status(500).json({ message: "Erreur lecture messages" });
  }
});

/* ---------------- FACTURE PDF PREMIUM ---------------- */

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

    const doc = new PDFDocument({ margin: 0, size: "A4" });

    const invoiceNumber = `FACT-${order._id.toString().slice(-8).toUpperCase()}`;
    const fileName = `facture-${order._id.toString().slice(-6)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    const purple = "#4f46e5";
    const pink = "#ec4899";
    const dark = "#111827";
    const grey = "#6b7280";
    const light = "#f8fafc";
    const border = "#e5e7eb";

    doc.rect(0, 0, pageWidth, pageHeight).fill("#f3f4ff");
    doc.circle(80, 80, 180).fillOpacity(0.22).fill("#c7d2fe");
    doc.circle(pageWidth - 70, 110, 170).fillOpacity(0.18).fill("#f9a8d4");
    doc.circle(pageWidth - 60, pageHeight - 80, 220).fillOpacity(0.18).fill("#bfdbfe");
    doc.fillOpacity(1);

    doc.roundedRect(35, 35, pageWidth - 70, pageHeight - 70, 28).fill("#ffffff");

    doc.roundedRect(55, 55, pageWidth - 110, 95, 22).fill(purple);
    doc.circle(pageWidth - 110, 80, 95).fillOpacity(0.32).fill(pink);
    doc.fillOpacity(1);

    doc.fillColor("#ffffff").fontSize(26).font("Helvetica-Bold").text("TA SHOP DU 78", 80, 78);

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#eef2ff")
      .text("Streetwear, sneakers et bons plans.", 82, 112);

    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor("#ffffff")
      .text("FACTURE", 380, 76, { width: 130, align: "right" });

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#eef2ff")
      .text(`Numero : ${invoiceNumber}`, 330, 106, { width: 180, align: "right" })
      .text(`Date : ${new Date(order.createdAt).toLocaleDateString("fr-FR")}`, 330, 121, {
        width: 180,
        align: "right",
      });

    doc.roundedRect(55, 175, 230, 125, 18).fill(light);

    doc.fillColor(dark).fontSize(13).font("Helvetica-Bold").text("Client", 75, 195);

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(grey)
      .text(
        order.userId?.name ||
          `${order.delivery?.firstName || ""} ${order.delivery?.lastName || ""}`,
        75,
        220
      )
      .text(order.userId?.email || "Email non renseigne", 75, 236)
      .text(order.delivery?.address || "", 75, 252)
      .text(`${order.delivery?.postalCode || ""} ${order.delivery?.city || ""}`, 75, 268)
      .text(order.delivery?.country || "France", 75, 284);

    doc.roundedRect(310, 175, 230, 125, 18).fill(light);

    doc.fillColor(dark).fontSize(13).font("Helvetica-Bold").text("Commande", 330, 195);

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(grey)
      .text(`Reference : #${order._id.toString().slice(-6).toUpperCase()}`, 330, 220)
      .text(`Statut : ${order.status || "En attente"}`, 330, 236)
      .text(`Paiement : ${order.payment?.status || "paid"}`, 330, 252)
      .text(`Livraison : ${order.shipping?.carrier || "Non defini"}`, 330, 268)
      .text(`${order.shipping?.service || ""}`, 330, 284);

    const tableX = 55;
    let y = 340;

    doc.fillColor(dark).fontSize(16).font("Helvetica-Bold").text("Details de la commande", tableX, y);

    y += 35;

    doc.roundedRect(tableX, y, pageWidth - 110, 38, 14).fill("#eef2ff");

    doc
      .fillColor(purple)
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Produit", tableX + 18, y + 13)
      .text("Qte", 330, y + 13)
      .text("Prix", 390, y + 13)
      .text("Total", 470, y + 13);

    y += 50;

    order.items.forEach((item, index) => {
      const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);

      doc
        .roundedRect(tableX, y - 8, pageWidth - 110, 54, 12)
        .fill(index % 2 === 0 ? "#ffffff" : "#fafafa");

      doc.roundedRect(tableX, y - 8, pageWidth - 110, 54, 12).strokeColor(border).stroke();

      doc.fillColor(dark).fontSize(10).font("Helvetica-Bold").text(item.name || "Produit", tableX + 18, y, {
        width: 240,
      });

      if (item.selectedColor || item.selectedSize) {
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor(grey)
          .text(
            `${item.selectedColor ? `Couleur : ${item.selectedColor}` : ""}${
              item.selectedColor && item.selectedSize ? "  |  " : ""
            }${item.selectedSize ? `Taille : ${item.selectedSize}` : ""}`,
            tableX + 18,
            y + 15,
            { width: 240 }
          );
      }

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(grey)
        .text(String(item.quantity || 1), 330, y)
        .text(`${formatPrice(item.price)} EUR`, 390, y)
        .text(`${formatPrice(lineTotal)} EUR`, 470, y);

      y += 62;
    });

    y += 15;

    doc.roundedRect(315, y, 225, 125, 20).fill("#f8fafc");

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(grey)
      .text("Sous-total", 335, y + 22)
      .text(`${formatPrice(order.subtotal)} EUR`, 440, y + 22, {
        width: 80,
        align: "right",
      });

    doc.text("Livraison", 335, y + 45).text(`${formatPrice(order.shipping?.price)} EUR`, 440, y + 45, {
      width: 80,
      align: "right",
    });

    doc.moveTo(335, y + 72).lineTo(520, y + 72).strokeColor(border).stroke();

    doc
      .fontSize(15)
      .font("Helvetica-Bold")
      .fillColor(purple)
      .text("Total paye", 335, y + 88)
      .text(`${formatPrice(order.total)} EUR`, 420, y + 88, {
        width: 100,
        align: "right",
      });

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(grey)
      .text(
        `Mode de livraison : ${order.shipping?.carrier || "Non defini"} - ${
          order.shipping?.service || ""
        }`,
        55,
        y + 25,
        { width: 230 }
      )
      .text(`Delai : ${order.shipping?.delay || "Non defini"}`, 55, y + 43, {
        width: 230,
      });

    doc.roundedRect(55, pageHeight - 105, pageWidth - 110, 50, 18).fill("#111827");

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#ffffff")
      .text("Merci pour ta commande chez TA SHOP DU 78.", 75, pageHeight - 87, {
        width: pageWidth - 150,
        align: "center",
      });

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#c7d2fe")
      .text(
        "Facture generee automatiquement - conserve ce document comme justificatif d'achat.",
        75,
        pageHeight - 70,
        {
          width: pageWidth - 150,
          align: "center",
        }
      );

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

    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).populate("userId", "name email");

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
      readByClient: true,
      readByAdmin: false,
      createdAt: new Date(),
    });

    order.unreadAdminCount = (order.unreadAdminCount || 0) + 1;
    order.lastSupportMessageAt = new Date();

    await order.save();

    const io = req.app.get("io");
    io?.to(`order-${order._id}`).emit("support-message", {
      order,
      sender: "client",
    });

    await sendMail({
      to: process.env.EMAIL_FROM,
      subject: "💬 Nouvelle demande SAV - TA SHOP DU 78",
      html: buildMailTemplate({
        title: "Nouvelle demande client 💬",
        subtitle: "Un client vient d’ouvrir une demande SAV.",
        badge: "SAV CLIENT",
        content: `
          <p><strong>Client :</strong> ${order.userId?.email || "Non renseigné"}</p>
          <p><strong>Commande :</strong> #${order._id.toString().slice(-6).toUpperCase()}</p>
          <p><strong>Type :</strong> ${type}</p>
          <p><strong>Raison :</strong> ${reason}</p>
          <p><strong>Message :</strong> ${message}</p>
        `,
        buttonText: "Ouvrir le dashboard",
        buttonUrl: `${FRONTEND_URL}/dashboard`,
      }),
    });

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

    const order = await Order.findOne(query).populate("userId", "name email role");

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const sender = req.user.role === "admin" ? "admin" : "client";

    order.supportMessages.push({
      sender,
      text: text || "",
      image: imageUrl,
      readByClient: sender === "client",
      readByAdmin: sender === "admin",
      createdAt: new Date(),
    });

    if (sender === "admin") {
      order.unreadClientCount = (order.unreadClientCount || 0) + 1;
    } else {
      order.unreadAdminCount = (order.unreadAdminCount || 0) + 1;
    }

    order.lastSupportMessageAt = new Date();

    await order.save();

    const updatedOrder = await Order.findById(order._id).populate(
      "userId",
      "name email role"
    );

    const io = req.app.get("io");
    io?.to(`order-${order._id}`).emit("support-message", {
      order: updatedOrder,
      sender,
    });

    const recipient = sender === "admin" ? order.userId?.email : process.env.EMAIL_FROM;

    await sendMail({
      to: recipient,
      subject:
        sender === "admin"
          ? "💬 Nouveau message du vendeur - TA SHOP DU 78"
          : "💬 Nouveau message client - TA SHOP DU 78",
      html: buildMailTemplate({
        title: sender === "admin" ? "Message du vendeur 💬" : "Nouveau message client 💬",
        subtitle:
          sender === "admin"
            ? "Le vendeur t’a répondu concernant ta commande."
            : "Un client vient d’envoyer un message SAV.",
        badge: "CONVERSATION SAV",
        content: `
          <p><strong>Commande :</strong> #${order._id.toString().slice(-6).toUpperCase()}</p>
          <p>${text || "Une image a été envoyée dans la conversation SAV."}</p>
          ${imageUrl ? `<p><a href="${imageUrl}">Voir l’image envoyée</a></p>` : ""}
        `,
        buttonText: sender === "admin" ? "Voir ma commande" : "Ouvrir le dashboard",
        buttonUrl: sender === "admin" ? `${FRONTEND_URL}/orders` : `${FRONTEND_URL}/dashboard`,
      }),
    });

    if (sender === "admin") {
      await sendPushToUser(
        order.userId._id,
        "💬 Nouveau message du vendeur",
        text || "Le vendeur t’a envoyé une réponse SAV.",
        `${FRONTEND_URL}/orders`
      );
    }

    res.json({ message: "Message envoyé", order: updatedOrder });
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
    }).populate("userId", "name email");

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    if (status === "Expédiée") {
      await sendMail({
        to: order.userId?.email,
        subject: "📦 Ta commande a été expédiée - TA SHOP DU 78",
        html: buildMailTemplate({
          title: "Commande expédiée 📦",
          subtitle: "Bonne nouvelle, ton colis est en route.",
          badge: "EXPÉDITION",
          content: `
            <p>Ta commande <strong>#${order._id.toString().slice(-6).toUpperCase()}</strong> a été expédiée.</p>
            <p><strong>Numéro de suivi :</strong> ${trackingNumber || "Non renseigné"}</p>
          `,
          buttonText: trackingUrl ? "Suivre mon colis" : "Voir ma commande",
          buttonUrl: trackingUrl || `${FRONTEND_URL}/orders`,
        }),
      });

      await sendPushToUser(
        order.userId._id,
        "📦 Commande expédiée",
        `Ta commande #${order._id.toString().slice(-6).toUpperCase()} est en route.`,
        `${FRONTEND_URL}/orders`
      );
    }

    if (status === "Livrée") {
      await sendMail({
        to: order.userId?.email,
        subject: "✅ Ta commande est livrée - TA SHOP DU 78",
        html: buildMailTemplate({
          title: "Commande livrée ✅",
          subtitle: "Ton achat est indiqué comme livré.",
          badge: "LIVRAISON TERMINÉE",
          content: `
            <p>Ta commande <strong>#${order._id.toString().slice(-6).toUpperCase()}</strong> est indiquée comme livrée.</p>
            <p>Merci pour ta confiance. Tu peux laisser un avis vérifié si ton article te plaît.</p>
          `,
          buttonText: "Voir ma commande",
          buttonUrl: `${FRONTEND_URL}/orders`,
        }),
      });

      await sendPushToUser(
        order.userId._id,
        "✅ Commande livrée",
        `Ta commande #${order._id.toString().slice(-6).toUpperCase()} est indiquée comme livrée.`,
        `${FRONTEND_URL}/orders`
      );
    }

    res.json(order);
  } catch (err) {
    console.log("ERREUR STATUS :", err.message);
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
    ).populate("userId", "name email");

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    await sendMail({
      to: order.userId?.email,
      subject: "📦 Suivi de ta commande - TA SHOP DU 78",
      html: buildMailTemplate({
        title: "Suivi colis 📦",
        subtitle: "Ton suivi de livraison est maintenant disponible.",
        badge: "SUIVI COMMANDE",
        content: `
          <p>Ta commande <strong>#${order._id.toString().slice(-6).toUpperCase()}</strong> est expédiée.</p>
          <p><strong>Numéro de suivi :</strong> ${trackingNumber || "Non renseigné"}</p>
        `,
        buttonText: trackingUrl ? "Suivre mon colis" : "Voir ma commande",
        buttonUrl: trackingUrl || `${FRONTEND_URL}/orders`,
      }),
    });

    await sendPushToUser(
      order.userId._id,
      "📦 Suivi colis disponible",
      `Ta commande #${order._id.toString().slice(-6).toUpperCase()} est expédiée.`,
      `${FRONTEND_URL}/orders`
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

    const order = await Order.findById(req.params.id).populate("userId", "name email");

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
      readByClient: false,
      readByAdmin: true,
      createdAt: new Date(),
    });

    order.unreadClientCount = (order.unreadClientCount || 0) + 1;
    order.lastSupportMessageAt = new Date();

    if (decision === "accepted" && order.customerRequest.type === "cancel") {
      order.status = "Annulée";
    }

    await order.save();

    const updatedOrder = await Order.findById(order._id).populate(
      "userId",
      "name email role"
    );

    const io = req.app.get("io");
    io?.to(`order-${order._id}`).emit("support-message", {
      order: updatedOrder,
      sender: "admin",
    });

    await sendMail({
      to: order.userId?.email,
      subject: "📢 Mise à jour de ta demande - TA SHOP DU 78",
      html: buildMailTemplate({
        title: decision === "accepted" ? "Demande acceptée ✅" : "Demande refusée ❌",
        subtitle: "Le vendeur a répondu à ta demande SAV.",
        badge: decision === "accepted" ? "DEMANDE ACCEPTÉE" : "DEMANDE REFUSÉE",
        content: `
          <p><strong>Commande :</strong> #${order._id.toString().slice(-6).toUpperCase()}</p>
          <p>${adminReply || "Une réponse a été ajoutée à ta demande."}</p>
        `,
        buttonText: "Voir ma commande",
        buttonUrl: `${FRONTEND_URL}/orders`,
      }),
    });

    await sendPushToUser(
      order.userId._id,
      decision === "accepted" ? "✅ Demande acceptée" : "❌ Demande refusée",
      adminReply || "Le vendeur a répondu à ta demande SAV.",
      `${FRONTEND_URL}/orders`
    );

    res.json({ message: "Réponse envoyée au client", order: updatedOrder });
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