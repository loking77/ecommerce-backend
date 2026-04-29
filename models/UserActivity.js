const mongoose = require("mongoose");

const UserActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    type: {
      type: String,
      enum: ["view", "cart"],
      required: true,
    },

    brand: String,
    category: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserActivity", UserActivitySchema);