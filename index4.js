import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";

dotenv.config();

/* =========================
   CONFIG
========================= */
const MONDAY_API_URL = "https://api.monday.com/v2";
const API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = Number(process.env.BOARD_ID);

if (!API_KEY || !BOARD_ID) {
  console.error("❌ Variables .env manquantes");
  process.exit(1);
}

/* =========================
   COLONNES (PRO)
========================= */
const COL_NUMBER = "numbers_mm06xxxx"; // 👈 SOURCE Number
const COL_TEXT   = "text_mm06mdpt";    // 👈 DESTINATION Text

/* =========================
   STATE
========================= */
const STATE_FILE = "./lastState.json";

const loadState = () =>
  fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))
    : { lastHash: null };

const saveState = (state) =>
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

/* =========================
   AXIOS
========================= */
const axiosMonday = axios.create({
  baseURL: MONDAY_API_URL,
  headers: { Authorization: API_KEY },
  timeout: 15000
});

/* =========================
   READ NUMBER COLUMN
========================= */
function getNumberValue(item) {
  const col = item.column_values.find(c => c.id === COL_NUMBER);
  if (!col) return null;

  if (col.value) {
    try {
      const parsed = JSON.parse(col.value);
      if (parsed?.number !== null) return Number(parsed.number);
    } catch {}
  }

  if (col.text && col.text.trim() !== "") {
    const n = Number(col.text.replace(",", "."));
    if (!Number.isNaN(n)) return n;
  }

  return null;
}

/* =========================
   FETCH ITEM BY ID
========================= */
async function fetchItem(itemId) {
  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        items(ids: [${itemId}]) {
          id
          column_values { id text value }
        }
      }
    }
  `;
  const res = await axiosMonday.post("", { query });
  return res.data.data.boards[0].items[0];
}

/* =========================
   UPDATE TEXT COLUMN
========================= */
async function updateText(itemId, value) {
  const mutation = `
    mutation {
      change_simple_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "${COL_TEXT}",
        value: "${String(value)}"
      ) { id }
    }
  `;
  await axiosMonday.post("", { query: mutation });
}

/* =========================
   HANDLE WEBHOOK
========================= */
async function handleWebhook(payload) {
  const itemId = payload.event?.pulseId || payload.itemId; // selon payload
  if (!itemId) return;

  const item = await fetchItem(itemId);
  const numberValue = getNumberValue(item);
  if (numberValue === null) {
    console.log(`⏭️ Item ${itemId} : Number vide`);
    return;
  }

  console.log(`🎯 Item ${itemId} : Number=${numberValue} → mise à jour Text`);
  await updateText(itemId, numberValue);
}

/* =========================
   EXPRESS SERVER
========================= */
const app = express();
app.use(bodyParser.json());

app.post("/monday-webhook", async (req, res) => {
  try {
    await handleWebhook(req.body);
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Erreur webhook :", err);
    res.status(500).send("Error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Webhook server actif sur port ${PORT}`));
