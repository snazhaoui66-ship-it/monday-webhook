import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

/* =========================
   CONFIG
========================= */
const MONDAY_API_URL = "https://api.monday.com/v2";
const API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;

if (!API_KEY || !BOARD_ID) {
  console.error("❌ ENV manquant (.env)");
  process.exit(1);
}

/* =========================
   COLONNES
========================= */
// 🔢 Colonne Formula (Number)
const COL_FORMULE = "formula_mm01xxxx";

// 📝 Colonne Text (destination)
const COL_TEXT = "text_mm01yyyy";

/* =========================
   STATE PRO
========================= */
const STATE_FILE = "./lastState.json";

const loadState = () =>
  fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))
    : { items: {} };

const saveState = (state) =>
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

/* =========================
   AXIOS
========================= */
const axiosMonday = axios.create({
  baseURL: MONDAY_API_URL,
  timeout: 15000,
  headers: { Authorization: API_KEY }
});

/* =========================
   HELPER UNIVERSEL
   Formula / Number / Mirror
========================= */
function getNumericColSafe(item, colId) {
  const col = item.column_values.find(c => c.id === colId);
  if (!col) return { value: 0, source: "missing" };

  if (col.value) {
    try {
      const parsed = JSON.parse(col.value);
      if (parsed?.number !== undefined && parsed.number !== null) {
        return { value: Number(parsed.number), source: "value:number" };
      }
    } catch {}
  }

  if (col.text) {
    const n = Number(col.text.replace(/[^\d.-]/g, ""));
    if (!Number.isNaN(n)) {
      return { value: n, source: "text:number" };
    }
  }

  return { value: 0, source: "empty" };
}

/* =========================
   FETCH ITEMS
========================= */
async function fetchItems() {
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
  return res.data.data.boards[0].items_page.items;
}

/* =========================
   UPDATE TEXT
========================= */
async function updateText(itemId, textValue) {
  const safeText = String(textValue ?? "");

  const mutation = `
    mutation {
      change_simple_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "${COL_TEXT}",
        value: "${safeText}"
      ) { id }
    }
  `;

  await axiosMonday.post("", { query: mutation });
}

/* =========================
   TRANSFERT FINAL
========================= */
async function transferFormulaToText() {
  const state = loadState();
  const items = await fetchItems();

  for (const item of items) {
    const formula = getNumericColSafe(item, COL_FORMULE);
    const newTextValue = String(formula.value);

    const lastTextValue =
      state.items[item.id]?.lastTextValue ?? null;

    console.log(
      `CHECK ${item.name} | FORMULE=${formula.value} | SRC=${formula.source} | LAST_TEXT=${lastTextValue}`
    );

    // 🔒 Anti boucle totale
    if (newTextValue === lastTextValue) continue;

    await updateText(item.id, newTextValue);

    state.items[item.id] = {
      lastTextValue: newTextValue
    };

    console.log(
      `✍️ SCRIPT_WRITE → ${item.name} = "${newTextValue}"`
    );
  }

  saveState(state);
}

/* =========================
   START
========================= */
(async () => {
  console.log("🚀 TRANSFERT FORMULA ➜ TEXT — ACTIF\n");

  try {
    await transferFormulaToText();
    console.log("\n✅ TRANSFERT TERMINÉ\n");
  } catch (err) {
    console.error("💥 ERREUR :", err.message);
  }
})();
