require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const passport = require("passport"); // ✅ IMPORTANT

require("./config/passport"); // ✅ CHARGE GOOGLE STRATEGY

const auth = require("./middleware/auth");

const app = express();

/* ---------------- CONFIG ---------------- */

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL;
const SERVER_URL = process.env.SERVER_URL;
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
app.use(passport.initialize()); // ✅ OBLIGATOIRE

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

/* ---------------- ROUTES ---------------- */

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

/* ---------------- MULTER MEMORY ---------------- */

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ---------------- ADMIN CHECK ---------------- */

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
    res.status(500).json({ message: "Erreur produits" });
  }
});

/* ---------------- TEST ---------------- */

app.get("/", (req, res) => {
  res.send("API OK 🚀");
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`Server running on ${SERVER_URL || `http://localhost:${PORT}`}`);
});