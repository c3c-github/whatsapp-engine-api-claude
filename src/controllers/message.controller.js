import prisma from "../lib/prisma.js";
import { getSocketInfo } from "../services/whatsapp.service.js";
import { createEvent } from "../services/event-log.service.js";

async function resolveChannel(req, res) {
  const channel = await prisma.channel.findFirst({ where: { id: req.params.id, org_id: req.org.id } });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return null; }
  return channel;
}

const VALID_SOURCE_SYSTEMS = ["API", "MIDDLEWARE", "WHATSAPP_DEVICE"];

async function sendMessage(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { to, content, source_system } = req.body;
  if (!to || !content) return res.status(400).json({ error: "Fields 'to' and 'content' are required" });
  const info = getSocketInfo(channel.id);
  if (!info?.sock) return res.status(409).json({ error: "Channel is not connected. Call /login first." });
  const resolvedSourceSystem = VALID_SOURCE_SYSTEMS.includes(source_system) ? source_system : "API";
  try {
    const msgContent = typeof content === "string" ? { text: content } : content;
    const sent = await info.sock.sendMessage(to, msgContent);
    const waMessageId = sent.key.id;
    const message = await prisma.message.create({ data: { org_id: channel.org_id, channel_id: channel.id, wa_message_id: waMessageId, remote_jid: to, direction: "OUTBOUND", source_system: resolvedSourceSystem, content: sent.message, status: "SENT" } });
    await createEvent({ org_id: channel.org_id, entity_type: "MESSAGE", entity_id: message.id, action: "CREATED", payload: { remote_jid: to, wa_message_id: waMessageId, source_system } });
    return res.status(201).json(message);
  } catch (err) {
    console.error("[Message] sendMessage:", err);
    return res.status(500).json({ error: "Failed to send message" });
  }
}

async function editMessage(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { wa_message_id } = req.params;
  const { content } = req.body;
  if (!content || typeof content !== "string") return res.status(400).json({ error: "Field 'content' (string) is required" });
  const info = getSocketInfo(channel.id);
  if (!info?.sock) return res.status(409).json({ error: "Channel is not connected" });
  try {
    const existing = await prisma.message.findFirst({ where: { channel_id: channel.id, wa_message_id } });
    if (!existing) return res.status(404).json({ error: "Message not found" });
    await info.sock.sendMessage(existing.remote_jid, { edit: { remoteJid: existing.remote_jid, id: wa_message_id }, text: content });
    const updated = await prisma.message.update({ where: { id: existing.id }, data: { content: { ...existing.content, editedText: content } } });
    await createEvent({ org_id: channel.org_id, entity_type: "MESSAGE", entity_id: existing.id, action: "UPDATED", payload: { wa_message_id, content } });
    return res.json(updated);
  } catch (err) {
    console.error("[Message] editMessage:", err);
    return res.status(500).json({ error: "Failed to edit message" });
  }
}

async function deleteMessage(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { wa_message_id } = req.params;
  const info = getSocketInfo(channel.id);
  if (!info?.sock) return res.status(409).json({ error: "Channel is not connected" });
  try {
    const existing = await prisma.message.findFirst({ where: { channel_id: channel.id, wa_message_id } });
    if (!existing) return res.status(404).json({ error: "Message not found" });
    await info.sock.sendMessage(existing.remote_jid, { delete: { remoteJid: existing.remote_jid, id: wa_message_id, fromMe: true } });
    const updated = await prisma.message.update({ where: { id: existing.id }, data: { is_deleted: true } });
    await createEvent({ org_id: channel.org_id, entity_type: "MESSAGE", entity_id: existing.id, action: "DELETED", payload: { wa_message_id } });
    return res.json(updated);
  } catch (err) {
    console.error("[Message] deleteMessage:", err);
    return res.status(500).json({ error: "Failed to delete message" });
  }
}

async function listOutbound(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { remote_jid, page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  try {
    const where = { channel_id: channel.id, direction: "OUTBOUND", ...(remote_jid ? { remote_jid } : {}) };
    const [messages, total] = await Promise.all([
      prisma.message.findMany({ where, orderBy: { created_at: "desc" }, skip, take: Number(limit) }),
      prisma.message.count({ where }),
    ]);
    return res.json({ data: messages, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[Message] listOutbound:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function listInbound(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { remote_jid, page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  try {
    const where = { channel_id: channel.id, direction: "INBOUND", is_deleted: false, ...(remote_jid ? { remote_jid } : {}) };
    const [messages, total] = await Promise.all([
      prisma.message.findMany({ where, orderBy: { created_at: "desc" }, skip, take: Number(limit) }),
      prisma.message.count({ where }),
    ]);
    return res.json({ data: messages, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[Message] listInbound:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteInbound(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { wa_message_id } = req.params;
  try {
    const existing = await prisma.message.findFirst({ where: { channel_id: channel.id, wa_message_id, direction: "INBOUND" } });
    if (!existing) return res.status(404).json({ error: "Message not found" });
    const updated = await prisma.message.update({ where: { id: existing.id }, data: { is_deleted: true } });
    await createEvent({ org_id: channel.org_id, entity_type: "MESSAGE", entity_id: existing.id, action: "DELETED", payload: { wa_message_id, reason: "local_delete" } });
    return res.json(updated);
  } catch (err) {
    console.error("[Message] deleteInbound:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export { sendMessage, editMessage, deleteMessage, listOutbound, listInbound, deleteInbound };
