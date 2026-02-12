import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// =========================
// INSTANCE ID UNIQUE POUR RAILWAY
// =========================
const INSTANCE_ID = Date.now();
console.log("🚀 SERVER INSTANCE ID:", INSTANCE_ID);

const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;
const PORT = process.env.PORT || 8080;

console.log("ENV MONDAY_API_KEY:", !!MONDAY_API_KEY);
console.log("ENV BOARD_ID:", !!BOARD_ID);
console.log("ENV PORT:", PORT);
console.log("BOARD_ID ACTUEL:", BOARD_ID);

if (!MONDAY_API_KEY || !BOARD_ID) {
  console.error("❌ VARIABLES D'ENV MANQUANTES");
  process.exit(1);
}

// =========================
// EXPRESS INIT
// =========================
const app = express();

// ⚠️ IMPORTANT POUR LIRE req.body
app.use(express.json());

// =========================
// GLOBAL LOGGER
// =========================
app.use((req, res, next) => {
  console.log("🌍 GLOBAL REQUEST:", req.method, req.url);
  next();
});

// =========================
// AXIOS MONDAY
// =========================
const axiosMonday = axios.create({
  baseURL: "https://api.monday.com/v2",
  timeout: 15000,
  headers: {
    Authorization: MONDAY_API_KEY,
    "Content-Type": "application/json",
  },
});

// =========================
// ROUTES BASIQUES
// =========================
app.get("/", (req, res) => {
  res.send("INSTANCE: " + INSTANCE_ID);
});

app.get("/health", (req, res) => {
  res.send("OK");
});

// =========================
// WEBHOOK MONDAY — DEBUG TOTAL
// =========================
app.post("/webhook/monday", (req, res) => {

  console.log("\n🔥🔥🔥 WEBHOOK HIT 🔥🔥🔥");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body reçu:", JSON.stringify(req.body, null, 2));
  console.log("🔥🔥🔥 FIN WEBHOOK 🔥🔥🔥\n");

  // Répond immédiatement
  res.status(200).send("OK");

});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
