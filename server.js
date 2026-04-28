require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

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
  .catch((err) => console.log("Erreur MongoDB :", err));

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

/* ---------------- CLOUDINARY UPLOAD FUNC ---------------- */

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "ecommerce" },
      (error, result) => {
        if (result) resolve(result.secure_url);
        else reject(error);
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
  } catch {
    res.status(500).json({ message: "Erreur produits" });
  }
});

/* ----------- VIEW COUNT ----------- */

app.patch("/products/:id/view", async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    res.json(product);
  } catch {
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
  } catch {
    res.status(500).json({ message: "Erreur avis" });
  }
});

app.post("/reviews/:productId", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || !comment) {
      return res.status(400).json({ message: "Champs requis" });
    }

    const review = await Review.create({
      productId: req.params.productId,
      userId: req.user.id,
      userName: req.user.name || req.user.email,
      rating: Number(rating),
      comment,
    });

    res.json(review);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Déjà commenté" });
    }
    res.status(500).json({ message: "Erreur avis" });
  }
});

/* ---------------- ADD PRODUCT ---------------- */

app.post("/products", auth, adminOnly, upload.array("images"), async (req, res) => {
  try {
    const imageUrls = [];

    if (req.files) {
      for (let file of req.files) {
        const url = await uploadToCloudinary(file.buffer);
        imageUrls.push(url);
      }
    }

    const product = new Product({
      ...req.body,
      price: Number(req.body.price || 0),
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
    res.status(500).json({ message: "Erreur ajout produit" });
  }
});

/* ---------------- UPDATE ---------------- */

app.put("/products/:id", auth, adminOnly, upload.array("images"), async (req, res) => {
  try {
    const data = {
      ...req.body,
      price: Number(req.body.price || 0),
      stock: Number(req.body.stock || 0),
    };

    if (req.files && req.files.length > 0) {
      const imageUrls = [];

      for (let file of req.files) {
        const url = await uploadToCloudinary(file.buffer);
        imageUrls.push(url);
      }

      data.image = imageUrls[0];
      data.images = imageUrls;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, data, {
      new: true,
    });

    res.json(product);
  } catch {
    res.status(500).json({ message: "Erreur update" });
  }
});

/* ---------------- DELETE ---------------- */

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
  console.log(`Server running on ${SERVER_URL}`);
});