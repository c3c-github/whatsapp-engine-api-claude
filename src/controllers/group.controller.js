import prisma from "../lib/prisma.js";
import { getSocketInfo } from "../services/whatsapp.service.js";
import { createEvent } from "../services/event-log.service.js";

async function resolveChannel(req, res) {
  const channel = await prisma.channel.findFirst({ where: { id: req.params.id, org_id: req.org.id } });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return null; }
  return channel;
}

async function createGroup(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { name, participants } = req.body;
  if (!name || !Array.isArray(participants) || participants.length === 0) return res.status(400).json({ error: "Fields 'name' and 'participants' (non-empty array) are required" });
  const info = getSocketInfo(channel.id);
  if (!info?.sock) return res.status(409).json({ error: "Channel is not connected" });
  try {
    const result = await info.sock.groupCreate(name, participants);
    const group = await prisma.group.create({ data: { org_id: channel.org_id, channel_id: channel.id, wa_group_id: result.id, name } });
    for (const jid of participants) {
      const contact = await prisma.contact.findFirst({ where: { org_id: channel.org_id, phone_number: jid } });
      if (contact) await prisma.groupParticipant.upsert({ where: { group_id_contact_id: { group_id: group.id, contact_id: contact.id } }, create: { group_id: group.id, contact_id: contact.id, role: "MEMBER" }, update: {} });
    }
    await createEvent({ org_id: channel.org_id, entity_type: "GROUP", entity_id: group.id, action: "CREATED", payload: { name, wa_group_id: result.id } });
    return res.status(201).json(group);
  } catch (err) {
    console.error("[Group] createGroup:", err);
    return res.status(500).json({ error: "Failed to create group" });
  }
}

async function updateGroup(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { wa_group_id } = req.params;
  const { add, remove, name, description } = req.body;
  const info = getSocketInfo(channel.id);
  if (!info?.sock) return res.status(409).json({ error: "Channel is not connected" });
  const group = await prisma.group.findFirst({ where: { channel_id: channel.id, wa_group_id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  try {
    if (Array.isArray(add) && add.length) {
      await info.sock.groupParticipantsUpdate(wa_group_id, add, "add");
      for (const jid of add) {
        const contact = await prisma.contact.findFirst({ where: { org_id: channel.org_id, phone_number: jid } });
        if (contact) await prisma.groupParticipant.upsert({ where: { group_id_contact_id: { group_id: group.id, contact_id: contact.id } }, create: { group_id: group.id, contact_id: contact.id, role: "MEMBER" }, update: {} });
      }
    }
    if (Array.isArray(remove) && remove.length) {
      await info.sock.groupParticipantsUpdate(wa_group_id, remove, "remove");
      for (const jid of remove) {
        const contact = await prisma.contact.findFirst({ where: { org_id: channel.org_id, phone_number: jid } });
        if (contact) await prisma.groupParticipant.deleteMany({ where: { group_id: group.id, contact_id: contact.id } });
      }
    }
    const updatedData = {};
    if (name) { await info.sock.groupUpdateSubject(wa_group_id, name); updatedData.name = name; }
    if (description !== undefined) { await info.sock.groupUpdateDescription(wa_group_id, description); updatedData.description = description; }
    const updated = await prisma.group.update({ where: { id: group.id }, data: updatedData });
    await createEvent({ org_id: channel.org_id, entity_type: "GROUP", entity_id: group.id, action: "UPDATED", payload: { add, remove, name, description } });
    return res.json(updated);
  } catch (err) {
    console.error("[Group] updateGroup:", err);
    return res.status(500).json({ error: "Failed to update group" });
  }
}

async function listGroups(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  try {
    const groups = await prisma.group.findMany({ where: { channel_id: channel.id }, include: { participants: { include: { contact: true } } }, orderBy: { created_at: "desc" } });
    return res.json(groups);
  } catch (err) {
    console.error("[Group] listGroups:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteGroup(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const { wa_group_id } = req.params;
  const info = getSocketInfo(channel.id);
  if (!info?.sock) return res.status(409).json({ error: "Channel is not connected" });
  const group = await prisma.group.findFirst({ where: { channel_id: channel.id, wa_group_id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  try {
    await info.sock.groupLeave(wa_group_id);
    await prisma.groupParticipant.deleteMany({ where: { group_id: group.id } });
    await prisma.group.delete({ where: { id: group.id } });
    await createEvent({ org_id: channel.org_id, entity_type: "GROUP", entity_id: group.id, action: "DELETED", payload: { wa_group_id } });
    return res.status(204).send();
  } catch (err) {
    console.error("[Group] deleteGroup:", err);
    return res.status(500).json({ error: "Failed to leave group" });
  }
}

async function syncGroups(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  const info = getSocketInfo(channel.id);
  if (!info?.sock) return res.status(409).json({ error: "Channel is not connected" });
  try {
    const waGroups = await info.sock.groupFetchAllParticipating();
    const entries = Object.values(waGroups);
    let synced = 0;
    for (const g of entries) {
      const waGroupId = g.id;
      const name = g.subject || "(sem nome)";
      const description = g.desc || null;
      const group = await prisma.group.upsert({
        where: { channel_id_wa_group_id: { channel_id: channel.id, wa_group_id: waGroupId } },
        create: { org_id: channel.org_id, channel_id: channel.id, wa_group_id: waGroupId, name, description },
        update: { name, description },
      });
      // Sync participants
      for (const p of (g.participants || [])) {
        const jid = p.id;
        const role = p.admin === "admin" || p.admin === "superadmin" ? "ADMIN" : "MEMBER";
        const contact = await prisma.contact.upsert({
          where: { org_id_phone_number: { org_id: channel.org_id, phone_number: jid } },
          create: { org_id: channel.org_id, name: jid.split("@")[0], phone_number: jid },
          update: {},
        });
        await prisma.groupParticipant.upsert({
          where: { group_id_contact_id: { group_id: group.id, contact_id: contact.id } },
          create: { group_id: group.id, contact_id: contact.id, role },
          update: { role },
        });
      }
      synced++;
    }
    await createEvent({ org_id: channel.org_id, entity_type: "GROUP", entity_id: channel.id, action: "UPDATED", payload: { synced } });
    return res.json({ synced, message: `${synced} group(s) synchronized` });
  } catch (err) {
    console.error("[Group] syncGroups:", err);
    return res.status(500).json({ error: "Failed to sync groups" });
  }
}

export { createGroup, updateGroup, listGroups, deleteGroup, syncGroups };
