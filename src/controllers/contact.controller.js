import prisma from "../lib/prisma.js";
import { createEvent } from "../services/event-log.service.js";

async function createContact(req, res) {
  const { name, phone_number } = req.body;
  const org_id = req.org.id;
  if (!name || !phone_number) return res.status(400).json({ error: "Fields 'name' and 'phone_number' are required" });
  try {
    const contact = await prisma.contact.create({ data: { org_id, name, phone_number } });
    await createEvent({ org_id, entity_type: "CONTACT", entity_id: contact.id, action: "CREATED", payload: { name, phone_number } });
    return res.status(201).json(contact);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Contact with this phone number already exists" });
    console.error("[Contact] createContact:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function listContacts(req, res) {
  const org_id = req.org.id;
  const { search } = req.query;
  try {
    const contacts = await prisma.contact.findMany({
      where: { org_id, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone_number: { contains: search } }] } : {}) },
      orderBy: { name: "asc" },
    });
    return res.json(contacts);
  } catch (err) {
    console.error("[Contact] listContacts:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function updateContact(req, res) {
  const { id } = req.params;
  const org_id = req.org.id;
  const { name, phone_number } = req.body;
  try {
    const existing = await prisma.contact.findFirst({ where: { id, org_id } });
    if (!existing) return res.status(404).json({ error: "Contact not found" });
    const updated = await prisma.contact.update({ where: { id }, data: { ...(name ? { name } : {}), ...(phone_number ? { phone_number } : {}) } });
    await createEvent({ org_id, entity_type: "CONTACT", entity_id: id, action: "UPDATED", payload: { name, phone_number } });
    return res.json(updated);
  } catch (err) {
    console.error("[Contact] updateContact:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteContact(req, res) {
  const { id } = req.params;
  const org_id = req.org.id;
  try {
    const existing = await prisma.contact.findFirst({ where: { id, org_id } });
    if (!existing) return res.status(404).json({ error: "Contact not found" });
    await prisma.contact.delete({ where: { id } });
    await createEvent({ org_id, entity_type: "CONTACT", entity_id: id, action: "DELETED", payload: { name: existing.name } });
    return res.status(204).send();
  } catch (err) {
    console.error("[Contact] deleteContact:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export { createContact, listContacts, updateContact, deleteContact };
