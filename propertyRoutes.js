const express = require("express");
const multer = require("multer");
const Property = require("./Property");
const Client = require("./Client");
const { protect, adminOnly } = require("./authMiddleware");
const { cloudinary } = require("./cloudinary");

const router = express.Router();
const uploadMemory = multer({ storage: multer.memoryStorage() });
const isAdmin = (user) => user?.role === "admin";
const isAssignedAgent = (property, user) => String(property?.assignedAgent) === String(user?._id);

function parseOptionalNumber(val) {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

const uploadBufferToCloudinary = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      return resolve(result);
    });
    stream.end(buffer);
  });

const ensureManualSellerClient = async ({ req, sellerInfo = {}, locationType = {}, address = "" }) => {
  if (sellerInfo.sellerType !== "manual") return sellerInfo;
  const manualSellerName = (sellerInfo.manualSellerName || "").trim();
  const manualSellerContact = (sellerInfo.manualSellerContact || "").trim();
  if (!manualSellerName || !manualSellerContact) return sellerInfo;

  let sellerClient = await Client.findOne({ contactNo: manualSellerContact });
  if (!sellerClient) {
    sellerClient = await Client.create({
      name: manualSellerName,
      contactNo: manualSellerContact,
      type: "Seller",
      propertyType: "Other",
      address: address || "",
      locationType: {
        country: "Nepal",
        province: locationType.province || "",
        district: locationType.district || "",
        municipality: locationType.municipality || "",
        vdc: locationType.vdc || "",
      },
      source: "Other",
      status: "Property Added/Requirement Taken",
      assignedAgent: req.body.assignedAgent || req.user._id,
      createdBy: req.user._id,
      notes: "Auto-created from property manual seller details",
      remarks: "",
      budget_npr: 0,
      location_preference: "",
    });
  } else {
    const updates = {
      name: sellerClient.name || manualSellerName,
      type: sellerClient.type === "Buyer" ? "Both" : sellerClient.type || "Seller",
      address: sellerClient.address || address || "",
      locationType: {
        country: "Nepal",
        province: sellerClient.locationType?.province || locationType.province || "",
        district: sellerClient.locationType?.district || locationType.district || "",
        municipality: sellerClient.locationType?.municipality || locationType.municipality || "",
        vdc: sellerClient.locationType?.vdc || locationType.vdc || "",
      },
    };
    Object.assign(sellerClient, updates);
    await sellerClient.save();
  }

  return {
    ...sellerInfo,
    sellerType: "linked",
    linkedSeller: sellerClient._id,
    manualSellerName,
    manualSellerContact,
  };
};

router.get("/", protect, async (req, res, next) => {
  try {
    const { province, district, municipality, vdc, propertyType, status, assignedAgent, propertyId, search, minPrice, maxPrice } = req.query;
    const query = {};
    if (province) query["locationType.province"] = province;
    if (district) query["locationType.district"] = district;
    if (municipality) query["locationType.municipality"] = municipality;
    if (vdc) query["locationType.vdc"] = vdc;
    if (propertyType) query.propertyType = propertyType;
    if (status) query.status = status;
    if (assignedAgent && isAdmin(req.user)) query.assignedAgent = assignedAgent;
    if (propertyId) query.propertyId = { $regex: propertyId, $options: "i" };
    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { propertyId: { $regex: safe, $options: "i" } },
        { name: { $regex: safe, $options: "i" } },
        { address: { $regex: safe, $options: "i" } },
        { exactLocation: { $regex: safe, $options: "i" } },
        { propertyDetails: { $regex: safe, $options: "i" } },
        { "locationType.province": { $regex: safe, $options: "i" } },
        { "locationType.district": { $regex: safe, $options: "i" } },
        { "locationType.municipality": { $regex: safe, $options: "i" } },
        { "locationType.vdc": { $regex: safe, $options: "i" } },
      ];
    }
    const minP = parseOptionalNumber(minPrice);
    const maxP = parseOptionalNumber(maxPrice);
    if (minP !== null || maxP !== null) {
      query.price_npr = {};
      if (minP !== null) query.price_npr.$gte = minP;
      if (maxP !== null) query.price_npr.$lte = maxP;
    }
    if (!isAdmin(req.user)) {
      query.assignedAgent = req.user._id;
    }

    const properties = await Property.find(query)
      .populate("createdBy", "name email role")
      .populate("assignedAgent", "name email role")
      .populate("sellerInfo.linkedSeller", "name contactNo email type")
      .sort({ createdAt: -1 });
    return res.json(properties);
  } catch (error) {
    return next(error);
  }
});

router.post("/", protect, async (req, res, next) => {
  try {
    const { name, address } = req.body;
    if (!name || !address) {
      return res.status(400).json({ message: "Name and address are required" });
    }

    const linkedSellerInfo = await ensureManualSellerClient({
      req,
      sellerInfo: req.body.sellerInfo || {},
      locationType: req.body.locationType || {},
      address: req.body.address || "",
    });

    const payload = {
      ...req.body,
      sellerInfo: linkedSellerInfo,
      price_npr: Number(req.body.price_npr || 0),
      assignedAgent: isAdmin(req.user) ? req.body.assignedAgent || req.user._id : req.user._id,
      createdBy: req.user._id,
    };
    const property = await Property.create(payload);

    return res.status(201).json(property);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
});

router.get("/:id", protect, async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!isAdmin(req.user) && !isAssignedAgent(property, req.user)) {
      return res.status(403).json({ message: "Access denied: assigned agent only" });
    }
    const populated = await Property.findById(property._id)
      .populate("createdBy", "name email role")
      .populate("assignedAgent", "name email role")
      .populate("sellerInfo.linkedSeller", "name contactNo email type source status remarks")
      .populate("interestedBuyers", "name contactNo type budget_npr");
    return res.json(populated);
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", protect, async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!isAdmin(req.user) && !isAssignedAgent(property, req.user)) {
      return res.status(403).json({ message: "Access denied: assigned agent only" });
    }
    const linkedSellerInfo = await ensureManualSellerClient({
      req,
      sellerInfo: req.body.sellerInfo || {},
      locationType: req.body.locationType || {},
      address: req.body.address || property.address || "",
    });

    Object.assign(property, {
      ...req.body,
      sellerInfo: linkedSellerInfo,
      price_npr: Number(req.body.price_npr || 0),
      assignedAgent: isAdmin(req.user) ? req.body.assignedAgent || property.assignedAgent : property.assignedAgent,
    });
    await property.save();
    const updated = await Property.findById(property._id)
      .populate("assignedAgent", "name email role")
      .populate("sellerInfo.linkedSeller", "name contactNo email type")
      .populate("interestedBuyers", "name contactNo type budget_npr");
    return res.json(updated);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
});

router.post("/:id/interested/:clientId", protect, async (req, res, next) => {
  try {
    const { id, clientId } = req.params;
    const [property, client] = await Promise.all([Property.findById(id), Client.findById(clientId)]);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!isAdmin(req.user) && !isAssignedAgent(property, req.user)) {
      return res.status(403).json({ message: "Access denied: assigned agent only" });
    }
    if (!client) return res.status(404).json({ message: "Client not found" });
    if (!["Buyer", "Both"].includes(client.type)) {
      return res.status(400).json({ message: "Only Buyer or Both clients can be linked as interested buyers" });
    }

    if (!property.interestedBuyers.some((buyerId) => String(buyerId) === String(client._id))) {
      property.interestedBuyers.push(client._id);
    }
    if (!client.interestedProperties.some((propertyId) => String(propertyId) === String(property._id))) {
      client.interestedProperties.push(property._id);
    }

    await Promise.all([property.save(), client.save()]);
    const updated = await Property.findById(property._id).populate("interestedBuyers", "name contactNo type budget_npr");
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/interested/:clientId", protect, async (req, res, next) => {
  try {
    const { id, clientId } = req.params;
    const [property, client] = await Promise.all([Property.findById(id), Client.findById(clientId)]);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!isAdmin(req.user) && !isAssignedAgent(property, req.user)) {
      return res.status(403).json({ message: "Access denied: assigned agent only" });
    }
    if (!client) return res.status(404).json({ message: "Client not found" });

    property.interestedBuyers = property.interestedBuyers.filter((buyerId) => String(buyerId) !== String(client._id));
    client.interestedProperties = client.interestedProperties.filter((propertyId) => String(propertyId) !== String(property._id));

    await Promise.all([property.save(), client.save()]);
    const updated = await Property.findById(property._id).populate("interestedBuyers", "name contactNo type budget_npr");
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", protect, adminOnly, async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    await property.deleteOne();
    return res.json({ message: "Property deleted" });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/images", protect, uploadMemory.array("images", 10), async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!isAdmin(req.user) && !isAssignedAgent(property, req.user)) {
      return res.status(403).json({ message: "Access denied: assigned agent only" });
    }
    if (!req.files?.length) return res.status(400).json({ message: "No images uploaded" });

    const uploads = await Promise.all(
      req.files.map((file) =>
        uploadBufferToCloudinary(file.buffer, {
          folder: "real-estate-erp/properties/images",
          resource_type: "image",
        })
      )
    );
    property.images.push(...uploads.map((item) => item.secure_url));
    await property.save();
    return res.json({ images: property.images });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/images", protect, async (req, res, next) => {
  try {
    const imageUrl = req.query.url || req.body?.url;
    if (!imageUrl) return res.status(400).json({ message: "Image URL is required" });

    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!isAdmin(req.user) && !isAssignedAgent(property, req.user)) {
      return res.status(403).json({ message: "Access denied: assigned agent only" });
    }

    const before = property.images.length;
    property.images = property.images.filter((url) => url !== imageUrl);
    if (property.images.length === before) {
      return res.status(404).json({ message: "Image not found on this property" });
    }
    await property.save();
    return res.json({ images: property.images });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/documents/:docIndex", protect, async (req, res, next) => {
  try {
    const index = Number(req.params.docIndex);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: "Invalid document index" });
    }

    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!isAdmin(req.user) && !isAssignedAgent(property, req.user)) {
      return res.status(403).json({ message: "Access denied: assigned agent only" });
    }
    if (index >= property.documents.length) {
      return res.status(404).json({ message: "Document not found" });
    }

    property.documents.splice(index, 1);
    await property.save();
    return res.json({ documents: property.documents });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/documents", protect, uploadMemory.single("document"), async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!isAdmin(req.user) && !isAssignedAgent(property, req.user)) {
      return res.status(403).json({ message: "Access denied: assigned agent only" });
    }
    if (!req.file) return res.status(400).json({ message: "No document uploaded" });
    const name = req.body.name || req.file.originalname;

    const upload = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "real-estate-erp/properties/documents",
      resource_type: "auto",
    });
    property.documents.push({
      name,
      url: upload.secure_url,
      uploadedAt: new Date(),
    });
    await property.save();
    return res.json({ documents: property.documents });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
