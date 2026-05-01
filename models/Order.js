const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        name: String,
        image: String,
        price: Number,
        quantity: Number,
      },
    ],

    subtotal: {
      type: Number,
      default: 0,
    },

    shipping: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    tracking: {
      number: {
        type: String,
        default: "",
      },
      url: {
        type: String,
        default: "",
      },
      shippedAt: {
        type: Date,
        default: null,
      },
    },

    total: {
      type: Number,
      default: 0,
    },

    payment: {
      stripeSessionId: {
        type: String,
        default: "",
      },
      status: {
        type: String,
        default: "",
      },
    },

    delivery: {
      firstName: String,
      lastName: String,
      phone: String,
      address: String,
      city: String,
      postalCode: String,
      country: String,
    },

    status: {
      type: String,
      default: "En attente",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);