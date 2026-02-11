import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// 🚀 Signature unique du container
const SERVER_INSTANCE_ID = Date.now();
console.log("🚀 SERVER INSTANCE ID:", SERVER_INSTANCE_ID);

// Variables d'environnement
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;
const PORT = process.env.PORT || 8080;

console.log("ENV MONDAY_API_KEY:", !!MONDAY_API_KEY);
console.log("ENV BOARD_ID:", !!BOARD_ID);
console.log("ENV PORT:", PORT);
console.log("BOARD_ID ACTUEL:", BOARD_ID);

// =========================
// EXPRESS INIT
// =========================
const app = express();
app.use(express.json());

// =========================
// DEBUG CATCH-ALL REQUEST LOGGER
// =========================
app.use((req, res, next) => {
  console.log("\n🔥 REQUÊTE ENTRANTE 🔥");
  console.log("METHOD:", req.method);
  console.log("URL   :", req.originalUrl);
  console.log("HEADERS:", JSON.stringify(req.headers, null, 2));
  console.log("BODY   :", JSON.stringify(req.body, null, 2));
  console.log("-----------------------------\n");
  next();
});

// =========================
// CONFIG MONDAY
// =========================
const MONDAY_API_URL = "https://api.monday.com/v2";
const axiosMonday = axios.create({
  baseURL: MONDAY_API_URL,
  timeout: 15000,
  headers: {
    Authorization: MONDAY_API_KEY || "",
    "Content-Type": "application/json",
  },
});

// Colonnes
const COL_FORM = "numeric_mm0d85cp";
const COL_TEXT = "text_mm0d8v52";
const COL_TRIGGER = "numeric_mm0dya1d";
const COL_SALAIRE = "numeric_mm0fkbs";

// =========================
// HELPERS
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
  try {
    const mutation = `
      mutation {
        change_simple_column_value(
          board_id: ${BOARD_ID},
          item_id: ${itemId},
          column_id: "${COL_SALAIRE}",
          value: "${Number(value)}"
        ) { id }
      }
    `;
    await axiosMonday.post("", { query: mutation });
  } catch (err) {
    console.error("❌ ERREUR updateSalaire:", err.message);
  }
}

// =========================
// FLAG LOG UNIQUE
// =========================
let INITIAL_STATE_LOGGED = false;

// =========================
// LOGIQUE PRINCIPALE SALAIRE
// =========================
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
          `• ${item.name} | FORM=${getNumeric(item, COL_FORM)} | TEXT="${getText(item, COL_TEXT)}" | TRIGGER=${getNumeric(item, COL_TRIGGER)} | SALAIRE=${getNumeric(item, COL_SALAIRE)}`
        );
      });
      console.log("📊 ===== FIN ÉTAT INITIAL =====\n");
      INITIAL_STATE_LOGGED = true;
    }

    for (const item of items) {
      if (item.id === triggerItemId) {
        const prev = getNumeric(item, COL_SALAIRE);
        const total = prev + addedValue;
        await updateSalaire(item.id, total);
        console.log(`➕ ${item.name} : ${prev} + ${addedValue} = ${total}`);
      } else {
        await updateSalaire(item.id, 0);
        console.log(`🔁 RESET ${item.name} → 0`);
      }
    }
  } catch (err) {
    console.error("❌ ERREUR handleSalaireTrigger:", err.message);
  }
}

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.send("OK"));

// =========================
// WEBHOOK MONDAY ULTRA-ROBUSTE
// =========================
app.post("/webhook/monday", async (req, res) => {
  console.log("\n🚨🚨🚨 WEBHOOK MONDAY REÇU 🚨🚨🚨");
  console.log("BODY COMPLET :");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("🚨🚨🚨 FIN WEBHOOK 🚨🚨🚨\n");

  // Challenge Monday
  if (req.body.challenge) {
    console.log("🟢 CHALLENGE VALIDATION");
    return res.status(200).json({ challenge: req.body.challenge });
  }

  res.status(200).send("OK"); // réponse rapide

  // Traitement après réponse
  const event = req.body.event || req.body.data || req.body;
  if (!event) return;

  const itemId = event.itemId || event.pulseId || event.id;
  if (!itemId) {
    console.warn("⚠️ Aucun itemId détecté dans l'event");
    return;
  }

  let numericValue = NaN;
  try {
    if (typeof event.value === "string") {
      numericValue = Number(JSON.parse(event.value)?.number);
    } else if (typeof event.value === "number") {
      numericValue = event.value;
    } else if (event.value && typeof event.value === "object") {
      numericValue = Number(event.value.number ?? event.value);
    }
  } catch (err) {
    console.error("❌ ERREUR parsing event.value:", err.message);
  }

  console.log(`🧪 EVENT → item=${itemId} | value=${numericValue}`);

  if (!Number.isNaN(numericValue)) {
    await handleSalaireTrigger(itemId, numericValue);
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
