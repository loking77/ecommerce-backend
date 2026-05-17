const mongoose = require("mongoose");

const PushTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      default: "web",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushToken", PushTokenSchema);