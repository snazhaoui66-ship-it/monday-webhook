import express from "express";
import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// =========================
// CONFIG
// =========================
const PORT = Number(process.env.PORT || 3000);
const MONDAY_API_URL = "https://api.monday.com/v2";
const API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;

// Colonnes
const COL_CIN = "text_mm01bvtw";

// =========================
// STATE
// =========================
const STATE_FILE = "./lastState.json";
const loadState = () =>
  fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : { items: {} };
const saveState = (state) => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// =========================
// AXIOS MONDAY
// =========================
const axiosMonday = axios.create({
  baseURL: MONDAY_API_URL,
  timeout: 15000,
  headers: { Authorization: API_KEY }
});

// =========================
// HELPER
// =========================
function getColSafe(item, colId) {
  const col = item.column_values.find(c => c.id === colId);
  if (!col) return 0;
  try {
    const parsed = JSON.parse(col.value);
    return parsed?.number ?? Number(col.text.replace(/[^\d.-]/g, "")) ?? 0;
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
      ) { id }
    }
  `;
  await axiosMonday.post("", { query: mutation });
}

// =========================
// LOGIQUE CIN
// =========================
async function handleCINChange(triggerItemId, triggerValue) {
  const state = loadState();

  // Récupérer tous les items du board
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

  // Appliquer déclencheur et reset autres
  for (const item of items) {
    const newVal = item.id === triggerItemId ? triggerValue : 0;
    await updateCIN(item.id, newVal);

    state.items[item.id] = {
      lastUserValue: item.id === triggerItemId ? triggerValue : state.items[item.id]?.lastUserValue ?? 0,
      lastScriptValue: newVal
    };

    console.log(`SCRIPT_WRITE → ${item.name} = ${newVal}`);
  }

  saveState(state);
}

// =========================
// EXPRESS SERVER
// =========================
const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;

    // Monday envoie la structure payload.event (v2 Webhook)
    const itemId = payload.event?.pulseId || payload.event?.itemId;
    const columnId = payload.event?.columnId;
    const value = Number(payload.event?.value);

    if (columnId === COL_CIN && itemId && !Number.isNaN(value)) {
      console.log(`🎯 Webhook reçu → Item ${itemId} CIN = ${value}`);
      await handleCINChange(itemId, value);
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("💥 ERREUR Webhook :", e.message);
    res.status(500).send("Error");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook CIN actif sur http://localhost:${PORT}/webhook`);
});
