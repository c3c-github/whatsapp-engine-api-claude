import prisma from "../lib/prisma.js";
import { usePostgresAuthState } from "./auth-store.service.js";
import { createEvent } from "./event-log.service.js";
import { publishToOrchestrator } from "./orchestrator.service.js";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode";

// In-memory maps: channelId -> { sock, qrCode }
const sockets = new Map();
const connecting = new Set();

function getSocketInfo(channelId) {
  return sockets.get(channelId) || null;
}

async function initSocket(channel) {
  const channelId = channel.id;

  if (connecting.has(channelId)) return;
  connecting.add(channelId);

  try {
    const existing = sockets.get(channelId);
    if (existing?.sock) {
      try {
        if (existing.sock.ws?.readyState === 1) return existing.sock;
        existing.sock.ev.removeAllListeners();
        existing.sock.terminate(); 
      } catch (_) {}
    }

  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));
  const { state: authState, saveCreds } = await usePostgresAuthState(channelId);

  const logger = pino({ level: "silent" });

  const sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
    browser: ["WhatsApp Engine API", "Chrome", "1.0.0"],
    syncFullHistory: false, // Stops "Syncing..." loop
    markOnlineOnConnect: true,
    connectTimeoutMs: 120000, // 120s timeout
    defaultQueryTimeoutMs: 60000, // 60s for queries
    keepAliveIntervalMs: 20000, // 20s keep-alive
    generateHighQualityLinkPreview: false, // Optimization
  });

  sockets.set(channelId, { sock, qrCode: null });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === "open" || qr) {
      connecting.delete(channelId);
    }

    if (qr) {
      const qrBase64 = await qrcode.toDataURL(qr);
      sockets.set(channelId, { sock, qrCode: qrBase64 });
      await prisma.channel.update({ where: { id: channelId }, data: { status: "AWAITING_QR" } });
      await createEvent({ org_id: channel.org_id, entity_type: "SESSION", entity_id: channelId, action: "UPDATED", payload: { status: "AWAITING_QR" } });
    }

    if (connection === "open") {
      sockets.set(channelId, { sock, qrCode: null });
      await prisma.channel.update({ where: { id: channelId }, data: { status: "CONNECTED" } });
      await createEvent({ org_id: channel.org_id, entity_type: "SESSION", entity_id: channelId, action: "CONNECTED", payload: { status: "CONNECTED" } });
      console.log(`[WhatsApp] Channel ${channelId} connected`);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      if (statusCode === undefined) {
        console.error(`[WhatsApp] Channel ${channelId} crashed or closed abruptly:`, lastDisconnect?.error);
      }

      sockets.delete(channelId);
      await prisma.channel.update({ where: { id: channelId }, data: { status: "DISCONNECTED" } });
      await createEvent({ org_id: channel.org_id, entity_type: "SESSION", entity_id: channelId, action: "DISCONNECTED", payload: { statusCode, shouldReconnect } });
      
      console.log(`[WhatsApp] Channel ${channelId} disconnected (code: ${statusCode}). Reconnect: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        const freshChannel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (freshChannel) {
          console.log(`[WhatsApp] Reconnecting channel ${channelId} in 5s...`);
          setTimeout(() => initSocket(freshChannel), 5000);
        }
      } else {
        connecting.delete(channelId);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify") return;
    for (const msg of msgs) {
      // Ignore historical/offline messages during initial sync
      if (msg.messageStubType || msg.key.remoteJid === 'status@broadcast') continue;
      if (!msg.message) continue;

      const direction = msg.key.fromMe ? "OUTBOUND" : "INBOUND";
      const remoteJid = msg.key.remoteJid;
      const waMessageId = msg.key.id;
      
      try {
        const messageTimestamp = msg.messageTimestamp; // in seconds
        const nowInSeconds = Math.floor(Date.now() / 1000);
        // If message is older than 10 minutes, it's a historical sync from Baileys
        const isHistoricalSync = (nowInSeconds - messageTimestamp) > 600;
        const initialOrchestratorStatus = isHistoricalSync ? "PROCESSADO" : "NOVO";

        const saved = await prisma.message.upsert({
          where: { channel_id_wa_message_id: { channel_id: channelId, wa_message_id: waMessageId } },
          create: { 
            org_id: channel.org_id, 
            channel_id: channelId, 
            wa_message_id: waMessageId, 
            remote_jid: remoteJid, 
            direction, 
            source_system: "WHATSAPP_DEVICE", 
            content: msg.message, 
            status: "DELIVERED",
            orchestrator_status: initialOrchestratorStatus
          },
          update: { status: "DELIVERED" },
        });
        await createEvent({ org_id: channel.org_id, entity_type: "MESSAGE", entity_id: saved.id, action: "CREATED", payload: { remote_jid: remoteJid, direction, wa_message_id: waMessageId } });

        if (direction === "INBOUND" && !isHistoricalSync) {
          try {
            const pendingMessages = await prisma.message.count({
              where: {
                remote_jid: remoteJid,
                direction: "INBOUND",
                orchestrator_status: { in: ["NOVO", "EM_PROCESSAMENTO", "ERRO"] },
                id: { not: saved.id }
              }
            });

            if (pendingMessages > 0) {
              console.log(`[WhatsApp] Skipping immediate publish for ${waMessageId} due to ${pendingMessages} pending messages (Sequencing)`);
              continue; // stays NOVO
            }

            await prisma.message.update({
              where: { id: saved.id },
              data: { orchestrator_status: "EM_PROCESSAMENTO" }
            });

            const phoneNumber = remoteJid.split('@')[0];
            const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
            const contactName = msg.pushName || null;

            await publishToOrchestrator({
              phone_number: phoneNumber,
              message_text: messageText,
              message_id: waMessageId,
              contact_name: contactName
            });

            await prisma.message.update({
              where: { id: saved.id },
              data: { orchestrator_status: "PROCESSADO", orchestrator_error: null }
            });
            console.log(`[WhatsApp] Successfully published message ${waMessageId} to Orchestrator.`);
          } catch (pubErr) {
            console.error(`[WhatsApp] Orchestrator publish failed for ${waMessageId}:`, pubErr.message);
            await prisma.message.update({
              where: { id: saved.id },
              data: { orchestrator_status: "ERRO", orchestrator_error: pubErr.message || "Unknown error" }
            });
          }
        }
      } catch (err) {
        console.error("[WhatsApp] Error saving message:", err.message);
      }
    }
  });

  sock.ev.on("contacts.upsert", async (contacts) => {
    for (const contact of contacts) {
      const { id, name, notify, verifiedName } = contact;
      if (!id || id.includes("@newsletter")) continue;
      try {
        await prisma.contact.upsert({
          where: { org_id_phone_number: { org_id: channel.org_id, phone_number: id } },
          create: { org_id: channel.org_id, name: name || notify || verifiedName || id.split("@")[0], phone_number: id },
          update: { name: name || notify || verifiedName || undefined },
        });
      } catch (err) {
        console.error("[WhatsApp] Error upserting contact:", err.message);
      }
    }
  });

  sock.ev.on("contacts.update", async (updates) => {
    for (const update of updates) {
      if (!update.id) continue;
      try {
        await prisma.contact.updateMany({
          where: { org_id: channel.org_id, phone_number: update.id },
          data: { name: update.name || update.verifiedName || undefined },
        });
      } catch (_) {}
    }
  });

  sock.ev.on("groups.update", async (updates) => {
    for (const update of updates) {
      const waGroupId = update.id;
      if (!waGroupId) continue;
      const group = await prisma.group.findFirst({ where: { channel_id: channelId, wa_group_id: waGroupId } });
      if (group) {
        const updatedData = {};
        if (update.subject) updatedData.name = update.subject;
        if (update.desc !== undefined) updatedData.description = update.desc;
        if (Object.keys(updatedData).length) {
          await prisma.group.update({ where: { id: group.id }, data: updatedData });
          await createEvent({ org_id: channel.org_id, entity_type: "GROUP", entity_id: group.id, action: "UPDATED", payload: updatedData });
        }
      }
    }
  });

    return sock;
  } catch (err) {
    connecting.delete(channelId);
    throw err;
  }
}

async function terminateSocket(channelId) {
  const info = sockets.get(channelId);
  if (info?.sock) {
    try { await info.sock.logout(); } catch (_) {}
    sockets.delete(channelId);
  }
}

export { initSocket, getSocketInfo, terminateSocket };
