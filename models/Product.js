const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
  name: String,
  brand: String,
  category: String,

  price: Number,
  oldPrice: Number,

  description: String,
  longDescription: String,

  // image principale
  image: String,

  // multi images (carousel)
  images: {
    type: [String],
    default: []
  },

  colors: [String],
  sizes: [String],
  stock: Number,

  specifications: {
    material: String,
    gender: String,
    origin: String,
    warranty: String
  },

  // ⭐ note moyenne
  rating: {
    type: Number,
    default: 4.5
  },

  // ⭐ nombre d’avis
  reviewsCount: {
    type: Number,
    default: 0
  },

  // 🔥 STATS E-COMMERCE (IMPORTANT)
  views: {
    type: Number,
    default: 0
  },

  cartAdds: {
    type: Number,
    default: 0
  },

  sold: {
    type: Number,
    default: 0
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Product", ProductSchema);