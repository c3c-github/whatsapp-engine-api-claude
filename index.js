require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const {
  WHATSAPP_API_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION = "v19.0",
  WEBHOOK_VERIFY_TOKEN,
} = process.env;

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    app: "whatsapp-engine-api",
    timestamp: new Date().toISOString(),
  });
});

// ─── Webhook Verification (Meta) ─────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    console.log("[Webhook] Verificado com sucesso");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── Webhook: receber mensagens ───────────────────────────────────────────────
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    body.entry?.forEach((entry) => {
      entry.changes?.forEach((change) => {
        const messages = change.value?.messages;
        if (messages) {
          messages.forEach((msg) => {
            console.log(
              `[Mensagem recebida] De: ${msg.from} | Tipo: ${msg.type}`,
            );
            if (msg.type === "text") {
              console.log(`  Texto: ${msg.text.body}`);
            }
          });
        }
      });
    });
  }

  res.sendStatus(200);
});

// ─── Enviar mensagem de texto ─────────────────────────────────────────────────
app.post("/send", async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: "Campos obrigatórios: to, message" });
  }

  try {
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(`[Mensagem enviada] Para: ${to}`);
    res.json({ success: true, data: response.data });
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error("[Erro ao enviar]", errData);
    res.status(500).json({ error: errData });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[WhatsApp Engine API] Rodando na porta ${PORT}`);
});
