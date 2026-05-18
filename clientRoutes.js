const express = require("express");
const mongoose = require("mongoose");
const Client = require("./Client");
const Property = require("./Property");
const { protect, adminOnly } = require("./authMiddleware");

const router = express.Router();

const isAdmin = (user) => user?.role === "admin";

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseOptionalNumber(val) {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

router.get("/", protect, async (req, res, next) => {
  try {
    const {
      type,
      status,
      source,
      assignedAgent,
      search,
      minBudget,
      maxBudget,
      province,
      district,
      municipality,
      vdc,
      hot,
    } = req.query;
    const query = {};
    const andParts = [];

    const isHot = hot === "1" || hot === "true";
    if (isHot) {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      andParts.push({
        type: { $in: ["Buyer", "Both"] },
        status: { $in: ["FB Lead", "Intake"] },
        updatedAt: { $lte: threeDaysAgo },
      });
    } else {
      if (type) query.type = type;
      if (status) query.status = status;
    }

    if (source) query.source = source;
    if (assignedAgent && mongoose.Types.ObjectId.isValid(assignedAgent)) query.assignedAgent = assignedAgent;
    if (province) query["locationType.province"] = province;
    if (district) query["locationType.district"] = district;
    if (municipality) query["locationType.municipality"] = municipality;
    if (vdc) query["locationType.vdc"] = vdc;
    if (search) {
      const safe = escapeRegex(search);
      andParts.push({
        $or: [
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
        ],
      });
    }
    const minB = parseOptionalNumber(minBudget);
    const maxB = parseOptionalNumber(maxBudget);
    if (minB !== null || maxB !== null) {
      query.budget_npr = {};
      if (minB !== null) query.budget_npr.$gte = minB;
      if (maxB !== null) query.budget_npr.$lte = maxB;
    }

    if (andParts.length) {
      query.$and = [...(query.$and || []), ...andParts];
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

/** Suggested listings for a buyer: matches budget (price ≤ budget × 1.15) + location preference tokens & client location fields. */
router.get("/:id/suggested-properties", protect, async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    if (!["Buyer", "Both"].includes(client.type)) {
      return res.json([]);
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
    const excludeIds = (client.interestedProperties || []).filter(Boolean);

    const query = {};
    if (excludeIds.length) query._id = { $nin: excludeIds };
    if (!isAdmin(req.user)) query.assignedAgent = req.user._id;

    const budget = Number(client.budget_npr) || 0;
    const andParts = [];

    if (budget > 0) {
      andParts.push({ price_npr: { $lte: Math.ceil(budget * 1.15) } });
    }

    const locOr = [];
    const pref = (client.location_preference || "").trim();
    if (pref) {
      const tokens = pref
        .split(/[,;\n]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
      const seen = new Set();
      for (const token of tokens) {
        const key = token.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const safe = escapeRegex(token);
        locOr.push(
          { address: { $regex: safe, $options: "i" } },
          { exactLocation: { $regex: safe, $options: "i" } },
          { name: { $regex: safe, $options: "i" } },
          { "locationType.province": { $regex: safe, $options: "i" } },
          { "locationType.district": { $regex: safe, $options: "i" } },
          { "locationType.municipality": { $regex: safe, $options: "i" } },
          { "locationType.vdc": { $regex: safe, $options: "i" } }
        );
      }
    }

    const lt = client.locationType || {};
    if (lt.province) locOr.push({ "locationType.province": lt.province });
    if (lt.district) locOr.push({ "locationType.district": lt.district });
    if (lt.municipality) locOr.push({ "locationType.municipality": lt.municipality });
    if (lt.vdc) locOr.push({ "locationType.vdc": lt.vdc });

    if (locOr.length) {
      andParts.push({ $or: locOr });
    }

    if (andParts.length) query.$and = andParts;

    let properties = await Property.find(query)
      .populate("assignedAgent", "name email role")
      .sort({ createdAt: -1 })
      .limit(limit);

    if (!properties.length) {
      const fallback = {};
      if (excludeIds.length) fallback._id = { $nin: excludeIds };
      if (!isAdmin(req.user)) fallback.assignedAgent = req.user._id;
      const fbAnd = [];
      if (budget > 0) fbAnd.push({ price_npr: { $lte: Math.ceil(budget * 1.15) } });
      if (fbAnd.length) fallback.$and = fbAnd;
      properties = await Property.find(fallback)
        .populate("assignedAgent", "name email role")
        .sort({ createdAt: -1 })
        .limit(limit);
    }

    return res.json(properties);
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
