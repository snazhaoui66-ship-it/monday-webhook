import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// 🔑 Ton API token Monday
const API_KEY = "TON_API_TOKEN";

// IDs des tableaux
const BOARD_SORTIE = 123456789;  // Sortie de stock
const BOARD_TOTAL = 987654321;   // Total / Article

// IDs des colonnes
const COL_ID = "text1";       // ID
const COL_ARTICLE = "text2";  // Article
const COL_QTE = "numbers1";   // Qte Stock
const COL_TOTAL = "numbers_total"; // Total
const COL_STATUT = "status";  // Statut

// ========================================
// 1️⃣ Webhook Statut = calculé
// ========================================
app.post("/webhook", async (req, res) => {
  try {
    const itemId = req.body.event.pulseId;
    const columnId = req.body.event.columnId;
    const value = req.body.event.value?.label;

    if (columnId !== COL_STATUT || value !== "calculé") {
      return res.status(200).send("Statut différent de calculé, rien à faire");
    }

    await calculerTotalArticle(itemId);
    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur serveur");
  }
});

// ========================================
// 2️⃣ Route bouton “Recalculer”
// ========================================
app.post("/recalculer", async (req, res) => {
  try {
    console.log("🔄 Recalcul manuel déclenché");

    // 1️⃣ Lire tous les items du tableau Total / Article
    const totalQuery = {
      query: `
        query {
          boards(ids: ${BOARD_TOTAL}) {
            items {
              id
              column_values {
                id
                text
              }
            }
          }
        }
      `
    };

    const totalRes = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: API_KEY },
      body: JSON.stringify(totalQuery)
    });

    const totalData = await totalRes.json();
    const items = totalData.data.boards[0].items;

    // 2️⃣ Parcourir chaque item et recalculer le Total
    for (const item of items) {
      await calculerTotalArticle(item.id);
    }

    res.status(200).send("Recalcul terminé ✅");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur serveur");
  }
});

// ========================================
// Fonction calcul automatique pour 1 item
// ========================================
async function calculerTotalArticle(itemId) {
  // 1️⃣ Récupérer l'ID de l'article
  const itemQuery = {
    query: `
      query {
        items(ids: ${itemId}) {
          column_values {
            id
            text
          }
        }
      }
    `
  };

  const itemRes = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: API_KEY },
    body: JSON.stringify(itemQuery)
  });
  const itemData = await itemRes.json();
  const articleID = itemData.data.items[0].column_values.find(c => c.id === COL_ID).text;

  // 2️⃣ Lire toutes les sorties de stock
  const stockQuery = {
    query: `
      query {
        boards(ids: ${BOARD_SORTIE}) {
          items {
            column_values {
              id
              text
            }
          }
        }
      }
    `
  };

  const stockRes = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: API_KEY },
    body: JSON.stringify(stockQuery)
  });

  const stockData = await stockRes.json();

  // 3️⃣ Calcul du total pour cet article
  let total = 0;
  stockData.data.boards[0].items.forEach(item => {
    const idCol = item.column_values.find(c => c.id === COL_ID);
    const qteCol = item.column_values.find(c => c.id === COL_QTE);
    if (idCol?.text === articleID) {
      total += Number(qteCol?.text || 0);
    }
  });

  // 4️⃣ Mettre à jour la colonne Total
  const updateMutation = {
    query: `
      mutation {
        change_simple_column_value(
          board_id: ${BOARD_TOTAL},
          item_id: ${itemId},
          column_id: "${COL_TOTAL}",
          value: "${total}"
        ) {
          id
        }
      }
    `
  };

  await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: API_KEY },
    body: JSON.stringify(updateMutation)
  });

  console.log(`✅ Total pour article ${articleID} mis à jour : ${total}`);
}

// ========================================
app.listen(3000, () => {
  console.log("🚀 Serveur actif sur http://localhost:3000");
});
