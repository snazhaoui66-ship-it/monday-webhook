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
app.use(express.json());

// =========================
// COLD START LOGGER
// =========================
let isColdStart = true;
const queuedRequests = [];

function logColdStart(req) {
  const timestamp = new Date().toISOString();
  const logMsg = `
🧊 [COLD START QUEUE] ${timestamp}
METHOD: ${req.method}
URL   : ${req.originalUrl}
HEADERS: ${JSON.stringify(req.headers)}
BODY   : ${JSON.stringify(req.body, null, 2)}
-----------------------------
`;
  console.log(logMsg);
}

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
// UTILS
// =========================
function getNumeric(item, colId) {
  const col = item.column_values.find(c => c.id === colId);
  if (!col) return 0;
  try {
    return JSON.parse(col.value)?.number ?? 0;
  } catch {
    return Number(col.text?.replace(/[^\d.-]/g, "")) || 0;
  }
}

function getText(item, colId) {
  return item.column_values.find(c => c.id === colId)?.text ?? "";
}

async function updateSalaire(itemId, value) {
  const mutation = `
    mutation {
      change_simple_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "numeric_mm0fkbs",
        value: "${Number(value)}"
      ) { id }
    }
  `;
  await axiosMonday.post("", { query: mutation });
}

// =========================
// LOGIQUE PRINCIPALE SALAIRE
// =========================
let INITIAL_STATE_LOGGED = false;

async function handleSalaireTrigger(triggerItemId, addedValue) {
  try {
    const query = `
      query {
        boards(ids: ${BOARD_ID}) {
          items_page(limit: 500) {
            items {
              id
              name
              column_values { id text value }
            }
          }
        }
      }
    `;
    const res = await axiosMonday.post("", { query });
    const items = res.data.data.boards[0].items_page.items;

    if (!INITIAL_STATE_LOGGED) {
      console.log("\n📊 ===== ÉTAT INITIAL DU BOARD =====");
      items.forEach(item => {
        console.log(
          `• ${item.name} | FORM=${getNumeric(item, "numeric_mm0d85cp")} | TEXT="${getText(item, "text_mm0d8v52")}" | TRIGGER=${getNumeric(item, "numeric_mm0dya1d")} | SALAIRE=${getNumeric(item, "numeric_mm0fkbs")}`
        );
      });
      console.log("📊 ===== FIN ÉTAT INITIAL =====\n");
      INITIAL_STATE_LOGGED = true;
    }

    for (const item of items) {
      if (item.id === triggerItemId) {
        const prev = getNumeric(item, "numeric_mm0fkbs");
        const total = prev + addedValue;
        await updateSalaire(item.id, total);
        console.log(`➕ ${item.name} : ${prev} + ${addedValue} = ${total}`);
      } else {
        await updateSalaire(item.id, 0);
        console.log(`🔁 RESET ${item.name} → 0`);
      }
    }
  } catch (err) {
    console.error("❌ ERREUR handleSalaireTrigger :", err.message);
  }
}

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => {
  res.send("INSTANCE: " + INSTANCE_ID);
});

app.get("/health", (req, res) => res.send("OK"));

// =========================
// WEBHOOK MONDAY ULTRA ROBUST (COLD START SAFE)
// =========================
app.post("/webhook/monday", async (req, res) => {
  // Réponse immédiate pour Monday
  res.status(200).send("OK");

  // Cold start check
  if (isColdStart) {
    queuedRequests.push(req);
    logColdStart(req);
    isColdStart = false;
  }

  // Logs immédiats pour toutes les requêtes
  console.log("\n🚨🚨🚨 WEBHOOK MONDAY REÇU 🚨🚨🚨");
  console.log("BODY COMPLET :", JSON.stringify(req.body, null, 2));
  console.log("🚨🚨🚨 FIN WEBHOOK 🚨🚨🚨\n");

  // Challenge Monday
  if (req.body.challenge) {
    console.log("🟢 CHALLENGE VALIDATION");
    return;
  }

  // Traitement asynchrone après réponse
  const event = req.body.event;
  if (!event) return;

  const itemId = event.itemId || event.pulseId;
  if (!itemId) return;

  let numericValue = NaN;
  try {
    if (typeof event.value === "string") {
      numericValue = Number(JSON.parse(event.value)?.number);
    } else if (typeof event.value === "number") {
      numericValue = event.value;
    }
  } catch {}

  console.log(`🧪 EVENT → item=${itemId} | value=${numericValue}`);

  if (!Number.isNaN(numericValue)) {
    handleSalaireTrigger(itemId, numericValue); // async fire & forget
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
