import express from "express";

const app = express();

app.use(express.json());

app.post("/webhook/monday", (req, res) => {
  console.log("📩 WEBHOOK MONDAY REÇU");
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).send("OK");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// ⚠️ UNE SEULE ÉCOUTE
app.listen(3000, "0.0.0.0", () => {
  console.log("🚀 Webhook Monday actif sur http://localhost:3000");
});
