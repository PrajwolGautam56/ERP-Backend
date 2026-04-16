const express = require("express");
const mongoose = require("mongoose");
const Client = require("./Client");
const Property = require("./Property");
const { protect, adminOnly } = require("./authMiddleware");

const router = express.Router();

router.get("/", protect, async (req, res, next) => {
  try {
    const { type, status, source, assignedAgent, search } = req.query;
    const query = {};

    if (type) query.type = type;
    if (status) query.status = status;
    if (source) query.source = source;
    if (assignedAgent && mongoose.Types.ObjectId.isValid(assignedAgent)) query.assignedAgent = assignedAgent;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { contactNo: { $regex: search, $options: "i" } },
      ];
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
