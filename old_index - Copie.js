import express from "express";

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("Webhook reçu ✅");
  console.log(req.body);
  res.send("OK");
});

app.listen(3000, () => {
  console.log("🚀 Serveur actif sur http://localhost:3000");
});
