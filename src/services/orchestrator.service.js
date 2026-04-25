import { Queue } from "bullmq";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

// We only initialize the connection if REDIS_URL is provided
let redisConnection = null;
let whatsappInboundQueue = null;

if (redisUrl) {
  try {
    const redisOptions = { maxRetriesPerRequest: null };
    if (redisUrl.startsWith("rediss://")) {
      redisOptions.tls = { rejectUnauthorized: false };
    }
    redisConnection = new Redis(redisUrl, redisOptions);
    whatsappInboundQueue = new Queue("whatsapp_inbound_queue", {
      connection: redisConnection,
    });
    console.log("[Orchestrator Service] Connected to Redis queue 'whatsapp_inbound_queue'");
  } catch (error) {
    console.error("[Orchestrator Service] Error initializing Redis:", error.message);
  }
} else {
  console.warn("[Orchestrator Service] REDIS_URL not found. Queue functionality is disabled.");
}

/**
 * Publishes an inbound message to the Orchestrator
 * @param {Object} payload
 * @param {string} payload.phone_number
 * @param {string} payload.message_text
 * @param {string} [payload.media_url]
 * @param {string} payload.message_id
 * @returns {Promise<boolean>} Resolves to true if queued successfully
 */
export async function publishToOrchestrator(payload) {
  if (!whatsappInboundQueue) {
    throw new Error("Queue not initialized (missing REDIS_URL)");
  }

  try {
    await whatsappInboundQueue.add("process_inbound", payload);
    return true;
  } catch (error) {
    console.error("[Orchestrator Service] Failed to publish message:", error.message);
    throw error;
  }
}
