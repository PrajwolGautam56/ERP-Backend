const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const authRoutes = require("./authRoutes");
const propertyRoutes = require("./propertyRoutes");
const clientRoutes = require("./clientRoutes");
const userRoutes = require("./userRoutes");
const taskRoutes = require("./taskRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Real Estate ERP API is running" });
});

app.get("/api", (_req, res) => {
  res.json({ message: "API root is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error",
  });
});

const startServer = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in .env");
  }
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing in .env");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log("Connected to MongoDB Atlas");

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
