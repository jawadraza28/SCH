import mongoose from "mongoose";

type MongoCache = { connectionPromise: Promise<typeof mongoose> | null };
const globalMongo = globalThis as typeof globalThis & { __schoolMongo?: MongoCache };
const mongoCache = globalMongo.__schoolMongo ?? { connectionPromise: null };
globalMongo.__schoolMongo = mongoCache;

/**
 * How hard the shared connection helper tries before surfacing an error.
 * Atlas/Vercel connectivity blips are usually short, so we retry a handful of
 * times with exponential backoff. The jitter stops instances that failed
 * together from reconnecting in lockstep and hammering the cluster.
 */
const MAX_CONNECT_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 750;
const MAX_RETRY_DELAY_MS = 6000;

function retryDelayMs(attempt: number) {
  const backoff = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  return backoff + Math.floor(Math.random() * 250);
}

export const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;
  // Join any in-flight attempt before starting another one. The promise lives on
  // globalThis, so every compiled copy of this module in the server bundle
  // cooperates instead of racing duplicate mongoose.connect() calls.
  if (mongoCache.connectionPromise) return mongoCache.connectionPromise;

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not defined");

  mongoCache.connectionPromise = (async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
      try {
        if (mongoose.connection.readyState === 2) {
          // An open started elsewhere is already in flight — wait for it rather
          // than calling connect() again. A second connect() while the state is
          // "connecting" can resolve before the socket is usable, which is what
          // used to surface as an instant failure on concurrent cold starts.
          await mongoose.connection.asPromise();
        } else if (mongoose.connection.readyState !== 1) {
          await mongoose.connect(mongoUri, {
            dbName: "school-management",
            maxPoolSize: 10,
            minPoolSize: 0,
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
            heartbeatFrequencyMS: 10000,
            retryWrites: true,
          });
        }
        if (mongoose.connection.readyState !== 1) throw new Error("MongoDB connection is not ready");
        console.log("✅ MongoDB Connected Successfully");
        return mongoose;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_CONNECT_ATTEMPTS) {
          if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => undefined);
          const delayMs = retryDelayMs(attempt);
          console.warn(`⚠️ MongoDB connection attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed; retrying in ${delayMs}ms`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("MongoDB connection failed");
  })().catch((error) => {
    mongoCache.connectionPromise = null;
    console.error("❌ MongoDB Connection Failed:", error);
    throw error;
  });

  return mongoCache.connectionPromise;
};

export const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    mongoCache.connectionPromise = null;
    console.log("👋 MongoDB Disconnected");
  } catch (error) {
    console.error("❌ MongoDB Disconnection Error:", error);
  }
};

export default connectToDatabase;