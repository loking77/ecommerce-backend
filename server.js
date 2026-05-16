require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const passport = require("passport");
const http = require("http");
const { Server } = require("socket.io");

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

/* ---------------- SOCKET.IO SERVER ---------------- */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [CLIENT_URL, "http://localhost:3000"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🟢 Client connecté socket :", socket.id);

  socket.on("join-order", (orderId) => {
    if (!orderId) return;
    socket.join(`order-${orderId}`);
    console.log(`💬 Socket ${socket.id} rejoint order-${orderId}`);
  });

  socket.on("leave-order", (orderId) => {
    if (!orderId) return;
    socket.leave(`order-${orderId}`);
    console.log(`🚪 Socket ${socket.id} quitte order-${orderId}`);
  });

  socket.on("typing", ({ orderId, sender }) => {
    if (!orderId) return;
    socket.to(`order-${orderId}`).emit("typing", { orderId, sender });
  });

  socket.on("stop-typing", ({ orderId, sender }) => {
    if (!orderId) return;
    socket.to(`order-${orderId}`).emit("stop-typing", { orderId, sender });
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client déconnecté socket :", socket.id);
  });
});

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

/* ---------------- DB ---------------- */

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch((err) => console.log("Erreur MongoDB :", err.message));

/* ---------------- ROUTES IMPORT ---------------- */

const paymentRoutes = require("./routes/payment");
const authRoutes = require("./routes/auth");
const cartRoutes = require("./routes/cart");
const profileRoutes = require("./routes/profile");
const orderRoutes = require("./routes/orders");
const shippingRoutes = require("./routes/shipping");

/* ---------------- STRIPE PAYMENT ROUTES AVANT JSON ---------------- */

app.use("/payment", paymentRoutes);

/* ---------------- MIDDLEWARE JSON POUR LE RESTE ---------------- */

app.use(express.json());
app.use(passport.initialize());

/* ---------------- OTHER ROUTES ---------------- */

app.use("/auth", authRoutes);
app.use("/cart", cartRoutes);
app.use("/profile", profileRoutes);
app.use("/orders", orderRoutes);
app.use("/shipping", shippingRoutes);

/* ---------------- CLOUDINARY ---------------- */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ---------------- MODELS ---------------- */

const Product = require("./models/Product");
const Review = require("./models/Review");
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
  } catch {
    res.status(500).json({ message: "Erreur vue" });
  }
});

/* ---------------- ACTIVITY ---------------- */

app.post("/activity/view", auth, async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await Product.findById(productId);

    await UserActivity.create({
      userId: req.user.id,
      productId,
      type: "view",
      brand: product.brand,
      category: product.category,
    });

    await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } });

    res.json({ message: "ok" });
  } catch {
    res.status(500).json({ message: "Erreur activité" });
  }
});

app.post("/activity/cart", auth, async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await Product.findById(productId);

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

    res.json({ message: "ok" });
  } catch {
    res.status(500).json({ message: "Erreur activité" });
  }
});

app.get("/activity/recommendations", auth, async (req, res) => {
  try {
    const activities = await UserActivity.find({ userId: req.user.id });

    const brands = activities.map((a) => a.brand).filter(Boolean);
    const categories = activities.map((a) => a.category).filter(Boolean);

    const recos = await Product.find({
      $or: [{ brand: { $in: brands } }, { category: { $in: categories } }],
    }).limit(8);

    res.json(recos);
  } catch {
    res.status(500).json({ message: "Erreur reco" });
  }
});

/* ---------------- ADD PRODUCT ---------------- */

app.post("/products", auth, adminOnly, upload.array("images"), async (req, res) => {
  try {
    const imageUrls = [];

    if (req.files && req.files.length > 0) {
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

/* ---------------- UPDATE PRODUCT ---------------- */

app.put("/products/:id", auth, adminOnly, upload.array("images"), async (req, res) => {
  try {
    const data = {
      ...req.body,
      price: Number(req.body.price || 0),
      oldPrice: Number(req.body.oldPrice || 0),
      stock: Number(req.body.stock || 0),
    };

    if (req.files && req.files.length > 0) {
      const imageUrls = [];

      for (const file of req.files) {
        const url = await uploadToCloudinary(file.buffer);
        imageUrls.push(url);
      }

      data.image = imageUrls[0];
      data.images = imageUrls;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, data, {
      returnDocument: "after",
    });

    res.json(product);
  } catch {
    res.status(500).json({ message: "Erreur update" });
  }
});

/* ---------------- DELETE PRODUCT ---------------- */

app.delete("/products/:id", auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        message: "Produit introuvable",
      });
    }

    const extractPublicId = (url) => {
      try {
        const parts = url.split("/");
        const file = parts[parts.length - 1];
        return `ecommerce/${file.split(".")[0]}`;
      } catch {
        return null;
      }
    };

    if (product.images && product.images.length > 0) {
      for (const imageUrl of product.images) {
        const publicId = extractPublicId(imageUrl);

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      }
    }

    if (product.image) {
      const publicId = extractPublicId(product.image);

      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    await Review.deleteMany({
      productId: req.params.id,
    });

    await UserActivity.deleteMany({
      productId: req.params.id,
    });

    res.json({
      message: "Produit supprimé + images Cloudinary supprimées",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Erreur suppression",
    });
  }
});

/* ---------------- TEST ---------------- */

app.get("/", (req, res) => {
  res.send("API OK 🚀");
});

/* ---------------- START ---------------- */

server.listen(PORT, () => {
  console.log(`🚀 Server running on ${SERVER_URL}`);
});