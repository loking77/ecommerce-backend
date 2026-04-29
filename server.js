require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const passport = require("passport");

require("./config/passport");

const auth = require("./middleware/auth");

const app = express();

/* ---------------- CONFIG ---------------- */

const PORT = process.env.PORT || 5000;

const CLIENT_URL =
  process.env.CLIENT_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000";

const SERVER_URL =
  process.env.SERVER_URL ||
  process.env.BACKEND_URL ||
  `http://localhost:${PORT}`;

const MONGO_URI = process.env.MONGO_URI;

/* ---------------- SECURITY ---------------- */

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/* ---------------- CORS ---------------- */

app.use(
  cors({
    origin: [CLIENT_URL, "http://localhost:3000"],
    credentials: true,
  })
);

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json());
app.use(passport.initialize());

/* ---------------- CLOUDINARY ---------------- */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ---------------- DB ---------------- */

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch((err) => console.log("Erreur MongoDB :", err.message));

/* ---------------- ROUTES IMPORT ---------------- */

const authRoutes = require("./routes/auth");
const cartRoutes = require("./routes/cart");
const profileRoutes = require("./routes/profile");
const orderRoutes = require("./routes/orders");
const shippingRoutes = require("./routes/shipping");
const paymentRoutes = require("./routes/payment");

app.use("/auth", authRoutes);
app.use("/cart", cartRoutes);
app.use("/profile", profileRoutes);
app.use("/orders", orderRoutes);
app.use("/shipping", shippingRoutes);
app.use("/payment", paymentRoutes);

/* ---------------- MODELS ---------------- */

const Product = require("./models/Product");
const Review = require("./models/Review");
const Order = require("./models/Order");
const User = require("./models/User");
const UserActivity = require("./models/UserActivity");

/* ---------------- MULTER ---------------- */

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ---------------- ADMIN ---------------- */

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès refusé" });
  }
  next();
};

/* ---------------- CLOUDINARY UPLOAD ---------------- */

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "ecommerce" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

/* ---------------- PRODUCTS ---------------- */

app.get("/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.log("Erreur produits :", err.message);
    res.status(500).json({ message: "Erreur produits" });
  }
});

app.patch("/products/:id/view", async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { returnDocument: "after" }
    );

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    res.json(product);
  } catch (err) {
    console.log("Erreur vue :", err.message);
    res.status(500).json({ message: "Erreur vue" });
  }
});

/* ---------------- ACTIVITY ---------------- */

app.post("/activity/view", auth, async (req, res) => {
  try {
    const { productId } = req.body;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    await UserActivity.create({
      userId: req.user.id,
      productId,
      type: "view",
      brand: product.brand,
      category: product.category,
    });

    await Product.findByIdAndUpdate(productId, {
      $inc: { views: 1 },
    });

    res.json({ message: "Vue enregistrée" });
  } catch (err) {
    console.log("Erreur activity view :", err.message);
    res.status(500).json({ message: "Erreur activité vue" });
  }
});

app.post("/activity/cart", auth, async (req, res) => {
  try {
    const { productId } = req.body;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    await UserActivity.create({
      userId: req.user.id,
      productId,
      type: "cart",
      brand: product.brand,
      category: product.category,
    });

    await Product.findByIdAndUpdate(productId, {
      $inc: { cartAdds: 1 },
    });

    res.json({ message: "Ajout panier enregistré" });
  } catch (err) {
    console.log("Erreur activity cart :", err.message);
    res.status(500).json({ message: "Erreur activité panier" });
  }
});

app.get("/activity/recommendations", auth, async (req, res) => {
  try {
    const activities = await UserActivity.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);

    const brandScores = {};
    const categoryScores = {};
    const seenProductIds = [];

    activities.forEach((a) => {
      const weight = a.type === "cart" ? 5 : 2;

      if (a.brand) {
        brandScores[a.brand] = (brandScores[a.brand] || 0) + weight;
      }

      if (a.category) {
        categoryScores[a.category] =
          (categoryScores[a.category] || 0) + weight;
      }

      if (a.productId) {
        seenProductIds.push(a.productId);
      }
    });

    const topBrands = Object.entries(brandScores)
      .sort((a, b) => b[1] - a[1])
      .map(([b]) => b)
      .slice(0, 3);

    const topCategories = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
      .slice(0, 3);

    let recommendations = await Product.find({
      _id: { $nin: seenProductIds },
      stock: { $gt: 0 },
      $or: [
        { brand: { $in: topBrands } },
        { category: { $in: topCategories } },
      ],
    })
      .sort({ cartAdds: -1, views: -1, rating: -1, createdAt: -1 })
      .limit(12);

    if (recommendations.length < 12) {
      const extra = await Product.find({
        _id: {
          $nin: [
            ...seenProductIds,
            ...recommendations.map((p) => p._id),
          ],
        },
        stock: { $gt: 0 },
      })
        .sort({ cartAdds: -1, views: -1, sold: -1 })
        .limit(12 - recommendations.length);

      recommendations = [...recommendations, ...extra];
    }

    res.json(recommendations);
  } catch (err) {
    console.log("Erreur recommandations :", err.message);
    res.status(500).json({ message: "Erreur recommandations" });
  }
});

/* ---------------- ADD PRODUCT ---------------- */

app.post("/products", auth, adminOnly, upload.array("images"), async (req, res) => {
  try {
    const imageUrls = [];

    if (req.files) {
      for (const file of req.files) {
        const url = await uploadToCloudinary(file.buffer);
        imageUrls.push(url);
      }
    }

    const product = new Product({
      ...req.body,
      price: Number(req.body.price || 0),
      oldPrice: Number(req.body.oldPrice || 0),
      stock: Number(req.body.stock || 0),
      image: imageUrls[0] || "",
      images: imageUrls,
      views: 0,
      cartAdds: 0,
      sold: 0,
    });

    await product.save();

    res.json(product);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Erreur ajout produit" });
  }
});

/* ---------------- TEST ---------------- */

app.get("/", (req, res) => {
  res.send("API OK 🚀");
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`Server running on ${SERVER_URL}`);
});