const express = require("express");
const User = require("./User");
const Client = require("./Client");
const Property = require("./Property");
const { protect, adminOnly } = require("./authMiddleware");

const router = express.Router();

router.get("/agents", protect, async (_req, res, next) => {
  try {
    const users = await User.find({ isActive: true }).select("name email role");
    return res.json(users);
  } catch (error) {
    return next(error);
  }
});

router.get("/", protect, adminOnly, async (_req, res, next) => {
  try {
    const users = await User.find().select("name email role isActive createdAt");
    return res.json(users);
  } catch (error) {
    return next(error);
  }
});

router.post("/", protect, adminOnly, async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "User already exists" });

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: role || "agent",
      isActive: true,
    });
    return res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/deactivate", protect, adminOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isActive = false;
    await user.save();
    return res.json({ message: "User deactivated" });
  } catch (error) {
    return next(error);
  }
});

router.get("/activity/all", protect, adminOnly, async (_req, res, next) => {
  try {
    const [clients, properties] = await Promise.all([
      Client.find().populate("createdBy", "name email role").sort({ createdAt: -1 }),
      Property.find().populate("createdBy", "name email role").sort({ createdAt: -1 }),
    ]);
    return res.json({ clients, properties });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
