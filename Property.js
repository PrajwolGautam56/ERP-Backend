const mongoose = require("mongoose");
const PropertyCounter = require("./PropertyCounter");

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    propertyId: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    exactLocation: { type: String, default: "" },
    propertyDetails: { type: String, default: "" },
    locationType: {
      country: { type: String, default: "Nepal" },
      province: {
        type: String,
        enum: ["Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim"],
      },
      district: { type: String, default: "" },
      municipality: { type: String, default: "" },
      vdc: { type: String, default: "" },
    },
    propertyType: { type: String, enum: ["Land", "House", "Apartment", "Commercial", "Other"], default: "Other" },
    price_npr: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["FB Lead", "Intake", "Property Added/Requirement Taken", "Property Sold"],
      default: "FB Lead",
    },
    remarks: { type: String, default: "" },
    images: [{ type: String }],
    documents: [documentSchema],
    interestedBuyers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Client" }],
    sellerInfo: {
      sellerType: { type: String, enum: ["linked", "manual"], default: "manual" },
      linkedSeller: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
      manualSellerName: { type: String, default: "" },
      manualSellerContact: { type: String, default: "" },
    },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

propertySchema.pre("validate", async function assignPropertyId(next) {
  const municipality = this.locationType?.municipality?.trim();
  const vdc = this.locationType?.vdc?.trim();
  if (!municipality && !vdc) {
    this.invalidate("locationType.municipality", "Either Municipality or VDC/Gaupalika is required");
    this.invalidate("locationType.vdc", "Either Municipality or VDC/Gaupalika is required");
    return next();
  }

  if (!this.isNew || this.propertyId) return next();

  const year = this.createdAt ? new Date(this.createdAt).getFullYear() : new Date().getFullYear();
  const prefix = String(year % 1000).padStart(3, "0");

  const counter = await PropertyCounter.findOneAndUpdate(
    { prefix },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  this.propertyId = `${prefix}-${String(counter.seq).padStart(3, "0")}`;
  return next();
});

module.exports = mongoose.model("Property", propertySchema);
