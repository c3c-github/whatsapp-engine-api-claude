import prisma from "../lib/prisma.js";

async function createEvent({ org_id, entity_type, entity_id, action, payload }) {
  try {
    await prisma.eventLog.create({
      data: { org_id, entity_type, entity_id, action, payload: payload || {} },
    });
  } catch (err) {
    console.error("[EventLog] Failed to write event:", err.message);
  }
}

export { createEvent };
