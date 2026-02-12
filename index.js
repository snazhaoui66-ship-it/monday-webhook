import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// =========================
// INSTANCE ID
// =========================
const INSTANCE_ID = Date.now();
console.log("🚀 SERVER INSTANCE ID:", INSTANCE_ID);

const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;
const PORT = process.env.PORT || 8080;

if (!MONDAY_API_KEY || !BOARD_ID) {
  console.error("❌ VARIABLES D'ENV MANQUANTES");
  process.exit(1);
}

// =========================
// EXPRESS
// =========================
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  console.log("🌍", req.method, req.url);
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
// UTILS SAFE
// =========================
function safeNumber(value) {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function getNumeric(item, colId) {
  const col = item.column_values?.find(c => c.id === colId);
  if (!col) return 0;

  try {
    if (col.value) {
      const parsed = JSON.parse(col.value);
      if (parsed?.number !== undefined) {
        return safeNumber(parsed.number);
      }
    }
  } catch {}

  return safeNumber(col.text?.replace(/[^\d.-]/g, ""));
}

async function updateSalaire(itemId, value) {
  const mutation = `
    mutation {
      change_simple_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "numeric_mm0fkbs",
        value: "${safeNumber(value)}"
      ) { id }
    }
  `;

  await axiosMonday.post("", { query: mutation });
}

// =========================
// LOGIQUE PRINCIPALE ROBUSTE
// =========================
async function handleSalaireTrigger(triggerItemId, addedValue) {
  console.log("⚙️ handleSalaireTrigger START");

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

    const items = res?.data?.data?.boards?.[0]?.items_page?.items;

    if (!items) {
      console.error("❌ Impossible de récupérer les items");
      return;
    }

    console.log(`📦 ${items.length} items récupérés`);

    for (const item of items) {
      const currentSalaire = getNumeric(item, "numeric_mm0fkbs");

      if (String(item.id) === String(triggerItemId)) {
        const newTotal = currentSalaire + safeNumber(addedValue);

        await updateSalaire(item.id, newTotal);

        console.log(
          `➕ ${item.name} | ${currentSalaire} + ${addedValue} = ${newTotal}`
        );
      } else {
        if (currentSalaire !== 0) {
          await updateSalaire(item.id, 0);
          console.log(`🔁 RESET ${item.name} → 0`);
        }
      }
    }

    console.log("✅ handleSalaireTrigger DONE");
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

app.get("/health", (req, res) => {
  res.send("OK");
});

// =========================
// WEBHOOK ROBUSTE
// =========================
app.post("/webhook/monday", async (req, res) => {
  console.log("🔥 WEBHOOK REÇU");
  console.log(JSON.stringify(req.body, null, 2));

  // Toujours répondre immédiatement (important Railway Free)
  res.status(200).send("OK");

  // Challenge Monday
  if (req.body.challenge) {
    console.log("🟢 Challenge validation");
    return;
  }

  const event = req.body?.event;
  if (!event) {
    console.log("⚠️ Aucun event");
    return;
  }

  const itemId = event.itemId || event.pulseId;
  if (!itemId) {
    console.log("⚠️ Aucun itemId");
    return;
  }

  let numericValue = 0;

  try {
    if (typeof event.value === "string") {
      const parsed = JSON.parse(event.value);
      numericValue = safeNumber(parsed?.number);
    } else {
      numericValue = safeNumber(event.value);
    }
  } catch {
    numericValue = 0;
  }

  console.log(`🧪 EVENT → item=${itemId} | value=${numericValue}`);

  if (numericValue !== 0) {
    handleSalaireTrigger(itemId, numericValue); // async
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
