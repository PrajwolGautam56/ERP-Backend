const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactNo: { type: String, required: true, trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    type: { type: String, enum: ["Buyer", "Seller", "Both"], required: true },
    propertyType: { type: String, enum: ["Land", "House", "Apartment", "Commercial", "Other"], default: "Other" },
    address: { type: String, default: "" },
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
    source: {
      type: String,
      enum: ["Facebook", "Instagram", "WhatsApp", "Phone Call", "Walk-in", "Referral", "Other"],
      default: "Other",
    },
    budget_npr: { type: Number, default: 0 },
    location_preference: { type: String, default: "" },
    notes: { type: String, default: "" },
    remarks: { type: String, default: "" },
    followUpDate: { type: Date },
    reminderDate: { type: Date },
    lastCallDate: { type: Date },
    lastTalkRemark: { type: String, default: "" },
    isHotBuyer: { type: Boolean, default: false },
    interestedProperties: [{ type: mongoose.Schema.Types.ObjectId, ref: "Property" }],
    status: {
      type: String,
      enum: ["FB Lead", "Intake", "Property Added/Requirement Taken", "Property Sold"],
      default: "FB Lead",
    },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Client", clientSchema);
