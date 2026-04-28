const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      },
      name: String,
      image: String,
      price: Number,
      quantity: Number
    }
  ],

  subtotal: Number,

  shipping: {
    carrier: String,
    service: String,
    price: Number,
    delay: String
  },

  tracking: {
    number: String,
    url: String,
    shippedAt: Date
  },

  total: Number,

  delivery: {
    firstName: String,
    lastName: String,
    phone: String,
    address: String,
    city: String,
    postalCode: String,
    country: String
  },

  status: {
    type: String,
    default: "En attente"
  }
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);