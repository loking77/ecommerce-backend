const mongoose = require("mongoose");

const ProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },

  firstName: String,
  lastName: String,
  phone: String,

  address: String,
  city: String,
  postalCode: String,
  country: String
}, { timestamps: true });

module.exports = mongoose.model("Profile", ProfileSchema);