import prisma from "../lib/prisma.js";
import { createEvent } from "../services/event-log.service.js";

async function createChannel(req, res) {
  const { phone_number, type } = req.body;
  const org_id = req.org.id;
  if (!phone_number) return res.status(400).json({ error: "Field 'phone_number' is required" });
  const channelType = type || "CENTRAL";
  if (!["CENTRAL", "PESSOAL"].includes(channelType)) return res.status(400).json({ error: "type must be CENTRAL or PESSOAL" });

  try {
    const channel = await prisma.channel.create({ data: { org_id, phone_number, type: channelType } });
    await createEvent({ org_id, entity_type: "CHANNEL", entity_id: channel.id, action: "CREATED", payload: { phone_number, type: channelType } });
    return res.status(201).json(channel);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Channel with this phone number already exists" });
    console.error("[Channel] createChannel:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function listChannels(req, res) {
  try {
    const channels = await prisma.channel.findMany({ where: { org_id: req.org.id }, orderBy: { created_at: "desc" } });
    return res.json(channels);
  } catch (err) {
    console.error("[Channel] listChannels:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getChannel(req, res) {
  try {
    const channel = await prisma.channel.findFirst({ where: { id: req.params.id, org_id: req.org.id } });
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    return res.json(channel);
  } catch (err) {
    console.error("[Channel] getChannel:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export { createChannel, listChannels, getChannel };
