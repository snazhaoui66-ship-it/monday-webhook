import express from "express";
import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// =========================
// CONFIG GÉNÉRALE (RAILWAY SAFE)
// =========================
const PORT = process.env.PORT || 3000; // ⚠️ Railway injecte PORT
const MONDAY_API_URL = "https://api.monday.com/v2";

const API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;

// Sécurité minimale
if (!API_KEY || !BOARD_ID) {
  console.error("❌ VARIABLES D'ENV MANQUANTES (MONDAY_API_KEY ou BOARD_ID)");
  process.exit(1);
}

// Colonnes
const COL_CIN = "text_mm01bvtw";

// =========================
// STATE (persistant local Railway)
// =========================
const STATE_FILE = "./lastState.json";

const loadState = () => {
  if (!fs.existsSync(STATE_FILE)) return { items: {} };
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
};

const saveState = (state) => {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
};

// =========================
// AXIOS MONDAY
// =========================
const axiosMonday = axios.create({
  baseURL: MONDAY_API_URL,
  timeout: 15000,
  headers: {
    Authorization: API_KEY,
    "Content-Type": "application/json"
  }
});

// =========================
// HELPERS
// =========================
function getColSafe(item, colId) {
  const col = item.column_values.find(c => c.id === colId);
  if (!col) return 0;

  try {
    const parsed = JSON.parse(col.value);
    return parsed?.number ?? 0;
  } catch {
    return Number(col.text.replace(/[^\d.-]/g, "")) || 0;
  }
}

// =========================
// UPDATE CIN
// =========================
async function updateCIN(itemId, value) {
  const mutation = `
    mutation {
      change_simple_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "${COL_CIN}",
        value: "${Number(value)}"
      ) {
        id
      }
    }
  `;

  await axiosMonday.post("", { query: mutation });
}

// =========================
// LOGIQUE CIN
// =========================
async function handleCINChange(triggerItemId, triggerValue) {
  const state = loadState();

  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        items_page(limit: 500) {
          items {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `;

  const res = await axiosMonday.post("", { query });
  const items = res.data.data.boards[0].items_page.items;

  for (const item of items) {
    const newVal = item.id === triggerItemId ? triggerValue : 0;

    await updateCIN(item.id, newVal);

    state.items[item.id] = {
      lastUserValue:
        item.id === triggerItemId
          ? triggerValue
          : state.items[item.id]?.lastUserValue ?? 0,
      lastScriptValue: newVal
    };

    console.log(`📝 SCRIPT_WRITE → ${item.name} = ${newVal}`);
  }

  saveState(state);
}

// =========================
// EXPRESS SERVER
// =========================
const app = express();
app.use(express.json());

// ✅ ROUTE HEALTH (OBLIGATOIRE)
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// ✅ WEBHOOK MONDAY
app.post("/webhook/monday", async (req, res) => {
  try {
    const payload = req.body;

    const itemId =
      payload.event?.pulseId ||
      payload.event?.itemId;

    const columnId = payload.event?.columnId;
    const value = Number(payload.event?.value);

    if (columnId === COL_CIN && itemId && !Number.isNaN(value)) {
      console.log(`🎯 Webhook Monday → Item ${itemId} | CIN = ${value}`);
      await handleCINChange(itemId, value);
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("💥 ERREUR WEBHOOK :", e);
    res.status(500).send("Error");
  }
});

// =========================
// START SERVER (RAILWAY)
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
