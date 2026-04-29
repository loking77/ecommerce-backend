require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const passport = require("passport");

require("./config/passport"); // Google Strategy

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

/* ---------------- ROUTES ---------------- */

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

/* ---------------- MULTER ---------------- */

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ---------------- ADMIN ---------------- */

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
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
    console.log(err);
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

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Erreur vue" });
  }
});

/* ---------------- REVIEWS ---------------- */

app.get("/reviews/:productId", async (req, res) => {
  try {
    const reviews = await Review.find({
      productId: req.params.productId,
    }).sort({ createdAt: -1 });

    const average =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    res.json({
      reviews,
      count: reviews.length,
      average: Number(average.toFixed(1)),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur avis" });
  }
});

app.post("/reviews/:productId", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const review = await Review.create({
      productId: req.params.productId,
      userId: req.user.id,
      rating,
      comment,
      verifiedPurchase: true,
    });

    res.json(review);
  } catch (err) {
    res.status(500).json({ message: "Erreur avis" });
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