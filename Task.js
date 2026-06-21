const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dueAt: { type: Date },
    reminderAt: { type: Date },
    priority: { type: String, enum: ["Low", "Normal", "High"], default: "Normal" },
    status: { type: String, enum: ["Open", "Done"], default: "Open" },
    relatedClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    relatedProperty: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  },
  { timestamps: true }
);

taskSchema.index({ assignedTo: 1, status: 1, dueAt: 1, reminderAt: 1 });

module.exports = mongoose.model("Task", taskSchema);
