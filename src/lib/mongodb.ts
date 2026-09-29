import mongoose from "mongoose";

let isConnected = false;

export const connectToDatabase = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  isConnected = false;

  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("❌ MONGODB_URI not defined in environment variables");
      throw new Error("MONGODB_URI not defined");
    }

    await mongoose.connect(mongoUri, {
      dbName: "school-management",
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    isConnected = mongoose.connection.readyState === 1;
    if (!isConnected) throw new Error("MongoDB connection did not become ready");
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    isConnected = false;
    console.error("❌ MongoDB Connection Failed:", error);
    throw error;
  }
};

export const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log("👋 MongoDB Disconnected");
  } catch (error) {
    console.error("❌ MongoDB Disconnection Error:", error);
  }
};

export default connectToDatabase;