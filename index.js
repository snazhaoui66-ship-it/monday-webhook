import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// =========================
// EXPRESS INIT
// =========================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
const COL_FORM = "numeric_mm0d85cp"; // résultat
const COL_TEXT = "text_mm0d8v52";    // déclencheur

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
    const parsed = JSON.parse(col.value);
    return parsed?.number ?? 0;
  } catch {
    return Number(col.text.replace(/[^\d.-]/g, "")) || 0;
  }
}

function getText(item, colId) {
  const col = item.column_values.find(c => c.id === colId);
  return col?.text ?? "";
}

async function updateNumeric(itemId, value) {
  const mutation = `
    mutation {
      change_simple_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "${COL_FORM}",
        value: "${Number(value)}"
      ) {
        id
      }
    }
  `;
  await axiosMonday.post("", { query: mutation });
}

// =========================
// GLOBAL FLAG (UNE SEULE FOIS)
// =========================
let INITIAL_STATE_LOGGED = false;

// =========================
// LOGIQUE PRINCIPALE
// =========================
async function handleTextTrigger(triggerItemId, addedValue) {
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

  // 🔎 LOG AVANT MODIFICATION — UNE SEULE FOIS
  if (!INITIAL_STATE_LOGGED) {
    console.log("\n📊 ===== ÉTAT INITIAL DU BOARD (AVANT MODIFICATION) =====");
    for (const item of items) {
      console.log(
        `• ${item.name} | COL_FORM=${getNumeric(item, COL_FORM)} | COL_TEXT="${getText(item, COL_TEXT)}"`
      );
    }
    console.log("📊 ===== FIN ÉTAT INITIAL =====\n");
    INITIAL_STATE_LOGGED = true;
  }

  // 🔁 TRAITEMENT
  for (const item of items) {
    if (item.id === triggerItemId) {
      const previous = getNumeric(item, COL_FORM);
      const newTotal = previous + addedValue;

      await updateNumeric(item.id, newTotal);
      console.log(`➕ ${item.name} : ${previous} + ${addedValue} = ${newTotal}`);
    } else {
      await updateNumeric(item.id, 0);
      console.log(`🔁 RESET ${item.name} → 0`);
    }
  }
}

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.send("OK"));

app.post("/webhook/monday", async (req, res) => {
  try {
    console.log("\n📩 WEBHOOK REÇU (BRUT) :");
    console.log(JSON.stringify(req.body, null, 2));

    // ✅ VALIDATION MONDAY
    if (req.body.challenge) {
      console.log("🟢 Challenge Monday détecté");
      return res.status(200).json({ challenge: req.body.challenge });
    }

    const payload = req.body;

    const itemId =
      payload.event?.pulseId ||
      payload.event?.itemId;

    const columnId = payload.event?.columnId;

    // ⚠️ TEXT column → valeur souvent dans value.label / text
    const rawValue =
      payload.event?.value?.label ||
      payload.event?.value ||
      payload.event?.text;

    const numericValue = Number(rawValue);

    console.log(`🧪 EVENT PARSING → column=${columnId} | raw="${rawValue}" | num=${numericValue}`);

    if (columnId === COL_TEXT && itemId && !Number.isNaN(numericValue)) {
      console.log(`🎯 TRIGGER OK → Item ${itemId} | +${numericValue}`);
      await handleTextTrigger(itemId, numericValue);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("💥 ERREUR WEBHOOK :", err);
    res.status(500).send("Error");
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
