const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
let apiKey = process.env.CLOUDINARY_API_KEY;
let apiSecret = process.env.CLOUDINARY_API_SECRET;

if ((!cloudName || !apiKey || !apiSecret) && process.env.CLOUDINARY_URL) {
  try {
    const parsed = new URL(process.env.CLOUDINARY_URL);
    cloudName = parsed.hostname;
    apiKey = decodeURIComponent(parsed.username);
    apiSecret = decodeURIComponent(parsed.password);
  } catch (_error) {
    // fallback to individual env vars below
  }
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "real-estate-erp",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const upload = multer({ storage });

module.exports = { cloudinary, upload };
