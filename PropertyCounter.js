const mongoose = require("mongoose");

const propertyCounterSchema = new mongoose.Schema(
  {
    prefix: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

module.exports = mongoose.model("PropertyCounter", propertyCounterSchema);
