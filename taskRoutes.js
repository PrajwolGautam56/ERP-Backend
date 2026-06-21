const express = require("express");
const mongoose = require("mongoose");
const Task = require("./Task");
const { protect } = require("./authMiddleware");

const router = express.Router();
const isAdmin = (user) => user?.role === "admin";

function cleanDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

router.get("/", protect, async (req, res, next) => {
  try {
    const query = {};
    if (!isAdmin(req.user)) query.assignedTo = req.user._id;
    if (req.query.status) query.status = req.query.status;
    if (req.query.assignedTo && isAdmin(req.user) && mongoose.Types.ObjectId.isValid(req.query.assignedTo)) {
      query.assignedTo = req.query.assignedTo;
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "name email role")
      .populate("assignedBy", "name email role")
      .populate("relatedClient", "name contactNo type")
      .populate("relatedProperty", "name propertyId address")
      .sort({ status: 1, reminderAt: 1, dueAt: 1, createdAt: -1 });

    return res.json(tasks);
  } catch (error) {
    return next(error);
  }
});

router.post("/", protect, async (req, res, next) => {
  try {
    const assignedTo = req.body.assignedTo || req.user._id;
    if (!req.body.title || !assignedTo) {
      return res.status(400).json({ message: "Title and assigned staff are required" });
    }

    const task = await Task.create({
      title: req.body.title,
      description: req.body.description || "",
      assignedTo,
      assignedBy: req.user._id,
      dueAt: cleanDate(req.body.dueAt),
      reminderAt: cleanDate(req.body.reminderAt),
      priority: req.body.priority || "Normal",
      relatedClient: mongoose.Types.ObjectId.isValid(req.body.relatedClient) ? req.body.relatedClient : undefined,
      relatedProperty: mongoose.Types.ObjectId.isValid(req.body.relatedProperty) ? req.body.relatedProperty : undefined,
    });

    const populated = await Task.findById(task._id)
      .populate("assignedTo", "name email role")
      .populate("assignedBy", "name email role")
      .populate("relatedClient", "name contactNo type")
      .populate("relatedProperty", "name propertyId address");
    return res.status(201).json(populated);
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", protect, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (!isAdmin(req.user) && String(task.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied: assigned staff only" });
    }

    const allowed = ["title", "description", "priority", "status", "assignedTo"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) task[key] = req.body[key];
    }
    if (req.body.dueAt !== undefined) task.dueAt = cleanDate(req.body.dueAt);
    if (req.body.reminderAt !== undefined) task.reminderAt = cleanDate(req.body.reminderAt);

    await task.save();
    const populated = await Task.findById(task._id)
      .populate("assignedTo", "name email role")
      .populate("assignedBy", "name email role")
      .populate("relatedClient", "name contactNo type")
      .populate("relatedProperty", "name propertyId address");
    return res.json(populated);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
