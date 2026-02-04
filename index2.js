import express from "express";

const app = express();
const PORT = 3000;

app.post("/webhook/monday", (req, res) => {
  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {
    console.log("✅ Webhook Monday reçu");

    if (body) {
      try {
        const parsed = JSON.parse(body);
        console.log(parsed);

        // 🔐 Validation Monday (CRITIQUE)
        if (parsed.challenge) {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(parsed.challenge); // ⬅️ FIN IMMEDIATE
          return;
        }
      } catch (e) {
        console.log("⚠️ JSON invalide");
      }
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
