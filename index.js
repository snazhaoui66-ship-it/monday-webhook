import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

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
  console.error(msg);
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
const COL_FORM = "numeric_mm0d85cp";     // résultat
const COL_TEXT = "text_mm0d8v52";        // texte (lecture)
const COL_TRIGGER = "numeric_mm0dya1d";  // Numbers déclencheur

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

async function updateNumeric(itemId, value) {
  const mutation = `
    mutation {
      change_simple_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "${COL_FORM}",
        value: "${Number(value)}"
      ) { id }
    }
  `;
  await axiosMonday.post("", { query: mutation });
}

// =========================
// FLAG GLOBAL
// =========================
let INITIAL_STATE_LOGGED = false;

// =========================
// LOGIQUE PRINCIPALE
// =========================
async function handleTextTrigger(triggerItemId, addedValue) {
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

    // 🔎 Log initial
    if (!INITIAL_STATE_LOGGED) {
      console.log("\n📊 ===== ÉTAT INITIAL DU BOARD =====");
      items.forEach(item => {
        console.log(
          `• ${item.name} | COL_FORM=${getNumeric(item, COL_FORM)} | COL_TEXT="${getText(item, COL_TEXT)}"`
        );
      });
      console.log("📊 ===== FIN ÉTAT INITIAL =====\n");
      INITIAL_STATE_LOGGED = true;
    }

    // 🔁 Logique métier
    for (const item of items) {
      if (item.id === triggerItemId) {
        const prev = getNumeric(item, COL_FORM);
        const total = prev + addedValue;
        await updateNumeric(item.id, total);
        console.log(`➕ ${item.name} : ${prev} + ${addedValue} = ${total}`);
      } else {
        await updateNumeric(item.id, 0);
        console.log(`🔁 RESET ${item.name} → 0`);
      }
    }
  } catch (err) {
    console.error("❌ ERREUR handleTextTrigger :", err.message);
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
  console.log("\n📩 WEBHOOK CRU (BRUT) :");
  console.log(JSON.stringify(req.body, null, 2));

  // ✅ Challenge Monday
  if (req.body.challenge) {
    console.log("🟢 Challenge Monday détecté");
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // ⚡ Réponse immédiate
  res.status(200).send("OK");

  // 🔍 Extraction robuste de l’event
  const body = req.body || {};
  const event = body.event || body.data || body; // fallback
  if (!event) {
    console.log("⚠️ Aucun event détecté dans le body");
    return;
  }

  // Extraction itemId robuste
  const itemId =
    event.itemId ||
    event.pulseId ||
    event.data?.id ||
    event.id ||
    event.pulse?.id ||
    null;

  if (!itemId) {
    console.log("⚠️ Aucun itemId détecté dans l'event :", event);
    return;
  }

  // Extraction valeur robuste
  let numericValue = NaN;
  try {
    if (typeof event.value === "string") {
      const parsed = JSON.parse(event.value);
      numericValue = Number(parsed?.number ?? parsed ?? NaN);
    } else if (typeof event.value === "number") {
      numericValue = event.value;
    } else if (event.value && typeof event.value === "object") {
      numericValue = Number(event.value.number ?? event.value);
    }
  } catch (err) {
    console.log("❌ Erreur parsing value :", err.message);
  }

  console.log(
    `🧪 EVENT → item=${itemId} | raw=${JSON.stringify(event.value)} | parsed=${numericValue}`
  );

  if (!Number.isNaN(numericValue)) {
    console.log(`🎯 TRIGGER CONFIRMÉ → Item ${itemId}`);
    await handleTextTrigger(itemId, numericValue);
  } else {
    console.log("⚠️ Valeur non numérique ignorée");
  }
});

// =========================
// DEBUG ENDPOINT
// =========================
app.all("/debug", (req, res) => {
  const msg = `
🧨 DEBUG ENDPOINT HIT 🧨
METHOD : ${req.method}
URL    : ${req.originalUrl}
HEADERS: ${JSON.stringify(req.headers)}
BODY   : ${JSON.stringify(req.body, null, 2)}
QUERY  : ${JSON.stringify(req.query)}
🧨 END DEBUG 🧨
`;
  process.stdout.write(msg + "\n");
  console.error(msg);

  res.status(200).json({ ok: true });
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
