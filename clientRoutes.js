const express = require("express");
const mongoose = require("mongoose");
const Client = require("./Client");
const Property = require("./Property");
const { protect, adminOnly } = require("./authMiddleware");

const router = express.Router();

function parseOptionalNumber(val) {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

router.get("/", protect, async (req, res, next) => {
  try {
    const { type, status, source, assignedAgent, search, minBudget, maxBudget } = req.query;
    const query = {};

    if (type) query.type = type;
    if (status) query.status = status;
    if (source) query.source = source;
    if (assignedAgent && mongoose.Types.ObjectId.isValid(assignedAgent)) query.assignedAgent = assignedAgent;
    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: safe, $options: "i" } },
        { contactNo: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
        { address: { $regex: safe, $options: "i" } },
        { location_preference: { $regex: safe, $options: "i" } },
        { notes: { $regex: safe, $options: "i" } },
        { "locationType.province": { $regex: safe, $options: "i" } },
        { "locationType.district": { $regex: safe, $options: "i" } },
        { "locationType.municipality": { $regex: safe, $options: "i" } },
        { "locationType.vdc": { $regex: safe, $options: "i" } },
      ];
    }
    const minB = parseOptionalNumber(minBudget);
    const maxB = parseOptionalNumber(maxBudget);
    if (minB !== null || maxB !== null) {
      query.budget_npr = {};
      if (minB !== null) query.budget_npr.$gte = minB;
      if (maxB !== null) query.budget_npr.$lte = maxB;
    }

    const clients = await Client.find(query)
      .populate("assignedAgent", "name email role")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    return res.json(clients);
  } catch (error) {
    return next(error);
  }
});

router.post("/", protect, async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      createdBy: req.user._id,
      assignedAgent: req.body.assignedAgent || req.user._id,
    };
    const client = await Client.create(payload);
    const populated = await Client.findById(client._id).populate("assignedAgent", "name email role");
    return res.status(201).json(populated);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", protect, async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate("assignedAgent", "name email role")
      .populate("createdBy", "name email role")
      .populate("interestedProperties");
    if (!client) return res.status(404).json({ message: "Client not found" });

    const linkedProperties = await Property.find({
      $or: [{ "sellerInfo.linkedSeller": client._id }, { client: client._id }],
    })
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    return res.json({ ...client.toObject(), linkedProperties });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", protect, async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    Object.assign(client, req.body);
    await client.save();

    const populated = await Client.findById(client._id)
      .populate("assignedAgent", "name email role")
      .populate("createdBy", "name email role");
    return res.json(populated);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", protect, adminOnly, async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    await client.deleteOne();
    return res.json({ message: "Client deleted" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
