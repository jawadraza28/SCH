import mongoose from "mongoose";

let connectionPromise: Promise<typeof mongoose> | null = null;

export const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connectionPromise) return connectionPromise;

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not defined");

  connectionPromise = (async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        if (mongoose.connection.readyState !== 1) {
          await mongoose.connect(mongoUri, {
            dbName: "school-management",
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 12000,
            connectTimeoutMS: 12000,
            heartbeatFrequencyMS: 10000,
          });
        }
        if (mongoose.connection.readyState === 1) {
          console.log("✅ MongoDB Connected Successfully");
          return mongoose;
        }
        throw new Error("MongoDB connection did not become ready");
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("MongoDB connection failed");
  })().catch((error) => {
    connectionPromise = null;
    console.error("❌ MongoDB Connection Failed:", error);
    throw error;
  });

  return connectionPromise;
};

export const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    connectionPromise = null;
    console.log("👋 MongoDB Disconnected");
  } catch (error) {
    console.error("❌ MongoDB Disconnection Error:", error);
  }
};

export default connectToDatabase;