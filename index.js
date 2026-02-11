import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

console.log("🚀 SERVER INSTANCE ID:", Date.now());


console.log("ENV MONDAY_API_KEY:", !!process.env.MONDAY_API_KEY);
console.log("ENV BOARD_ID:", !!process.env.BOARD_ID);
console.log("ENV PORT:", process.env.PORT);

console.log("BOARD_ID ACTUEL:", BOARD_ID);


// =========================
// EXPRESS INIT
// =========================
const app = express();
app.use(express.json());

// =========================
// GLOBAL LOGGER
// =========================
app.use((req, res, next) => {
  const msg = `
🔥 REQUEST INTERCEPTED 🔥
METHOD : ${req.method}
URL    : ${req.originalUrl}
HEADERS: ${JSON.stringify(req.headers)}
BODY   : ${JSON.stringify(req.body, null, 2)}
-------------------------------
`;
  process.stdout.write(msg + "\n");
  next();
});

// =========================
// CONFIG
// =========================
const PORT = process.env.PORT || 3000;
const MONDAY_API_URL = "https://api.monday.com/v2";
const API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;

if (!API_KEY || !BOARD_ID) {
  console.error("❌ VARIABLES D'ENV MANQUANTES");
  process.exit(1);
}

// Colonnes
const COL_FORM = "numeric_mm0d85cp";
const COL_TEXT = "text_mm0d8v52";
const COL_TRIGGER = "numeric_mm0dya1d";
const COL_SALAIRE = "numeric_mm0fkbs";

// =========================
// AXIOS MONDAY
// =========================
const axiosMonday = axios.create({
  baseURL: MONDAY_API_URL,
  timeout: 15000,
  headers: {
    Authorization: API_KEY,
    "Content-Type": "application/json",
  },
});

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
      console.log("\n📊 ===== ÉTAT INITIAL AVANT MODIFICATION =====");
      items.forEach(item => {
        console.log(
          `• ${item.name}
             FORM=${getNumeric(item, COL_FORM)}
             TEXT="${getText(item, COL_TEXT)}"
             TRIGGER=${getNumeric(item, COL_TRIGGER)}
             SALAIRE=${getNumeric(item, COL_SALAIRE)}
          `
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
    console.error("❌ ERREUR handleSalaireTrigger :", err.message);
  }
}

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.send("OK"));

// =========================
// WEBHOOK MONDAY (VERSION DEBUG ULTRA VISIBLE)
// =========================
app.post("/webhook/monday", async (req, res) => {

  console.log("\n");
  console.log("🚨🚨🚨 WEBHOOK MONDAY REÇU 🚨🚨🚨");
  console.log("BODY COMPLET :");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("🚨🚨🚨 FIN WEBHOOK 🚨🚨🚨");
  console.log("\n");

  // Challenge Monday
  if (req.body.challenge) {
    console.log("🟢 CHALLENGE VALIDATION");
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Toujours répondre 200 rapidement
  res.status(200).send("OK");

  // Traitement après réponse
  const event = req.body.event;
  if (!event) return;

  const itemId = event.itemId || event.pulseId;
  if (!itemId) return;

  let numericValue = NaN;

  try {
    if (typeof event.value === "string") {
      const parsed = JSON.parse(event.value);
      numericValue = Number(parsed?.number);
    } else if (typeof event.value === "number") {
      numericValue = event.value;
    }
  } catch {}

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
