require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const auth = require("./middleware/auth");

const app = express();

/* ---------------- CONFIG ---------------- */

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const MONGO_URI = process.env.MONGO_URI;

/* ---------------- CLOUDINARY ---------------- */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* ---------------- CORS PRO ---------------- */

app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json());

/* ---------------- DB ---------------- */

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.log("Erreur MongoDB :", err));

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

const Product = require("./models/Product");
const Review = require("./models/Review");

/* ---------------- MULTER (MEMORY) ---------------- */

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ---------------- ADMIN CHECK ---------------- */

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès refusé" });
  }
  next();
};

/* ---------------- PRODUCTS ---------------- */

app.get("/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch {
    res.status(500).json({ message: "Erreur produits" });
  }
});

/* ---------------- ADD PRODUCT (CLOUDINARY) ---------------- */

app.post("/products", auth, adminOnly, upload.any(), async (req, res) => {
  try {
    let images = [];

    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "ecommerce" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(file.buffer);
        });

        images.push(uploadResult.secure_url);
      }
    }

    const product = new Product({
      ...req.body,
      price: Number(req.body.price || 0),
      stock: Number(req.body.stock || 0),
      image: images[0] || "",
      images,
      views: 0,
      cartAdds: 0,
      sold: 0
    });

    await product.save();
    res.json(product);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Erreur upload cloudinary" });
  }
});

/* ---------------- UPDATE PRODUCT ---------------- */

app.put("/products/:id", auth, adminOnly, upload.any(), async (req, res) => {
  try {
    const data = {
      ...req.body,
      price: Number(req.body.price || 0),
      stock: Number(req.body.stock || 0)
    };

    if (req.files && req.files.length > 0) {
      const images = [];

      for (let file of req.files) {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "ecommerce" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(file.buffer);
        });

        images.push(uploadResult.secure_url);
      }

      data.image = images[0];
      data.images = images;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
    res.json(product);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Erreur update" });
  }
});

/* ---------------- DELETE PRODUCT ---------------- */

app.delete("/products/:id", auth, adminOnly, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    await Review.deleteMany({ productId: req.params.id });
    res.json({ message: "Supprimé" });
  } catch {
    res.status(500).json({ message: "Erreur delete" });
  }
});

/* ---------------- TEST ---------------- */

app.get("/", (req, res) => {
  res.send("API OK 🚀");
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});