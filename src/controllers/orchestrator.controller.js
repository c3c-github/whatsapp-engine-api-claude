import prisma from "../lib/prisma.js";
import { getSocketInfo } from "../services/whatsapp.service.js";
import { createEvent } from "../services/event-log.service.js";

async function orchestratorSendMessage(req, res) {
  try {
    const { phone_number, message_text } = req.body;
    
    if (!phone_number || !message_text) {
      return res.status(400).json({ error: "phone_number and message_text are required" });
    }

    // Acha o primeiro canal conectado
    const channel = await prisma.channel.findFirst({
      where: { status: "CONNECTED" }
    });

    if (!channel) {
      return res.status(409).json({ error: "No connected channels available" });
    }

    const info = getSocketInfo(channel.id);
    if (!info?.sock) {
      return res.status(409).json({ error: "Channel socket is not active" });
    }

    // Envia a mensagem pelo Baileys
    const sent = await info.sock.sendMessage(phone_number, { text: message_text });
    const waMessageId = sent.key.id;

    // Registra a mensagem no banco
    const message = await prisma.message.create({
      data: {
        org_id: channel.org_id,
        channel_id: channel.id,
        wa_message_id: waMessageId,
        remote_jid: phone_number,
        direction: "OUTBOUND",
        source_system: "MIDDLEWARE",
        content: sent.message,
        status: "SENT"
      }
    });

    await createEvent({
      org_id: channel.org_id,
      entity_type: "MESSAGE",
      entity_id: message.id,
      action: "CREATED",
      payload: { remote_jid: phone_number, wa_message_id: waMessageId, source_system: "MIDDLEWARE" }
    });

    return res.status(201).json(message);
  } catch (error) {
    console.error("[OrchestratorWebhook] Error sending message:", error);
    return res.status(500).json({ error: "Failed to send message via webhook" });
  }
}

export { orchestratorSendMessage };
