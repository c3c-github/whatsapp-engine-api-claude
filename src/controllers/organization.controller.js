import { v4 as uuidv4 } from "uuid";
import prisma from "../lib/prisma.js";
import { createEvent } from "../services/event-log.service.js";

async function createOrganization(req, res) {
  const { name, webhook_url } = req.body;
  if (!name) return res.status(400).json({ error: "Field 'name' is required" });

  try {
    const api_key = uuidv4();
    const org = await prisma.organization.create({
      data: { name, api_key, webhook_url: webhook_url || null },
    });
    await createEvent({ org_id: org.id, entity_type: "ORGANIZATION", entity_id: org.id, action: "CREATED", payload: { name } });
    return res.status(201).json(org);
  } catch (err) {
    console.error("[Organization] createOrganization:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getOrganization(req, res) {
  const { id } = req.params;
  if (req.org.id !== id) return res.status(403).json({ error: "Forbidden" });
  try {
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) return res.status(404).json({ error: "Organization not found" });
    return res.json(org);
  } catch (err) {
    console.error("[Organization] getOrganization:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export { createOrganization, getOrganization };
