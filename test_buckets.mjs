// Temporary diagnostic: runs the four finance bucket expressions against the
// real database and reports which ones MongoDB accepts.
import mongoose from "mongoose";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

try {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log("connected");
} catch (e) {
  console.log("CONNECT FAIL:", e.message);
  process.exit(1);
}

const coll = mongoose.connection.collection("financeentries");
const exprs = {
  daily: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } },
  weekly: { $dateToString: { format: "%Y-%m-%d", date: "$date", startOfWeek: "monday", timezone: "UTC" } },
  monthly: { $dateToString: { format: "%Y-%m", date: "$date", timezone: "UTC" } },
  yearly: { $dateToString: { format: "%Y", date: "$date", timezone: "UTC" } },
};
const start = new Date(Date.now() - 400 * 864e5);

for (const [name, expr] of Object.entries(exprs)) {
  try {
    const rows = await coll
      .aggregate([{ $match: { date: { $gte: start } } }, { $group: { _id: { key: expr, type: "$type" }, total: { $sum: "$amount" } } }])
      .toArray();
    console.log(name, "OK —", rows.length, "rows", JSON.stringify(rows.slice(0, 3)));
  } catch (e) {
    console.log(name, "FAIL:", e.message);
  }
}

// also count docs and show a sample date type
const one = await coll.findOne({});
console.log("sample date value:", one ? JSON.stringify(one.date) : "(empty collection)");
await mongoose.disconnect();
