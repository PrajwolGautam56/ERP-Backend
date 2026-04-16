const express = require("express");
const multer = require("multer");
const Property = require("./Property");
const Client = require("./Client");
const { protect, adminOnly } = require("./authMiddleware");
const { cloudinary } = require("./cloudinary");

const router = express.Router();
const uploadMemory = multer({ storage: multer.memoryStorage() });

const uploadBufferToCloudinary = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      return resolve(result);
    });
    stream.end(buffer);
  });

router.get("/", protect, async (req, res, next) => {
  try {
    const { province, district, municipality, vdc, propertyType, status, assignedAgent, propertyId, search } = req.query;
    const query = {};
    if (province) query["locationType.province"] = province;
    if (district) query["locationType.district"] = district;
    if (municipality) query["locationType.municipality"] = municipality;
    if (vdc) query["locationType.vdc"] = vdc;
    if (propertyType) query.propertyType = propertyType;
    if (status) query.status = status;
    if (assignedAgent) query.assignedAgent = assignedAgent;
    if (propertyId) query.propertyId = { $regex: propertyId, $options: "i" };
    if (search) {
      query.$or = [
        { propertyId: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
      ];
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

    const payload = {
      ...req.body,
      price_npr: Number(req.body.price_npr || 0),
      assignedAgent: req.body.assignedAgent || req.user._id,
      createdBy: req.user._id,
    };
    const property = await Property.create(payload);

    return res.status(201).json(property);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", protect, async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
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
    Object.assign(property, {
      ...req.body,
      price_npr: Number(req.body.price_npr || 0),
      assignedAgent: req.body.assignedAgent || property.assignedAgent,
    });
    await property.save();
    const updated = await Property.findById(property._id)
      .populate("assignedAgent", "name email role")
      .populate("sellerInfo.linkedSeller", "name contactNo email type")
      .populate("interestedBuyers", "name contactNo type budget_npr");
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/interested/:clientId", protect, async (req, res, next) => {
  try {
    const { id, clientId } = req.params;
    const [property, client] = await Promise.all([Property.findById(id), Client.findById(clientId)]);
    if (!property) return res.status(404).json({ message: "Property not found" });
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

router.post("/:id/documents", protect, uploadMemory.single("document"), async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
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
