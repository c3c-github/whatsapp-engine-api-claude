import prisma from "../lib/prisma.js";
import { publishToOrchestrator } from "./orchestrator.service.js";

async function processPendingMessages() {
  try {
    // 1. Encontrar usuários (remote_jid) que possuem mensagens pendentes (NOVO ou ERRO)
    // Agrupamos para processar usuário por usuário sequencialmente
    const distinctUsers = await prisma.message.findMany({
      where: {
        direction: "INBOUND",
        orchestrator_status: { in: ["NOVO", "ERRO"] }
      },
      select: { remote_jid: true },
      distinct: ['remote_jid']
    });

    for (const { remote_jid } of distinctUsers) {
      // 2. Buscar as mensagens pendentes DESTE USUÁRIO ordenadas por data (mais antigas primeiro)
      const pendingMessages = await prisma.message.findMany({
        where: {
          remote_jid,
          direction: "INBOUND",
          orchestrator_status: { in: ["NOVO", "ERRO"] }
        },
        orderBy: { created_at: "asc" }
      });

      for (const msg of pendingMessages) {
        // Status protection to EM_PROCESSAMENTO
        await prisma.message.update({
          where: { id: msg.id },
          data: { orchestrator_status: "EM_PROCESSAMENTO" }
        });

        try {
          const phoneNumber = msg.remote_jid.split('@')[0];
          
          // O conteúdo está no formato JSON salvo pelo Baileys
          let messageText = "";
          if (msg.content && typeof msg.content === 'object') {
             messageText = msg.content.conversation || msg.content.extendedTextMessage?.text || "";
          }

          const contact = await prisma.contact.findFirst({ where: { phone_number: msg.remote_jid } });
          const contactName = contact?.name || null;

          await publishToOrchestrator({
            phone_number: phoneNumber,
            message_text: messageText,
            message_id: msg.wa_message_id,
            contact_name: contactName
          });

          await prisma.message.update({
            where: { id: msg.id },
            data: { orchestrator_status: "PROCESSADO", orchestrator_error: null }
          });
          
          console.log(`[Retry Worker] Successfully published backlog message ${msg.wa_message_id}`);
        } catch (error) {
          console.error(`[Retry Worker] Failed to publish backlog message ${msg.wa_message_id}:`, error.message);
          
          await prisma.message.update({
            where: { id: msg.id },
            data: { orchestrator_status: "ERRO", orchestrator_error: error.message || "Unknown error" }
          });
          
          // BREAK the inner loop: If the oldest message failed, we do NOT process the next messages 
          // for this user to guarantee sequential order.
          break;
        }
      }
    }
  } catch (error) {
    console.error("[Retry Worker] General error:", error);
  }
}

let retryInterval = null;

export function startRetryWorker() {
  if (retryInterval) return;
  console.log("[Retry Worker] Starting background worker (runs every 1 minute)...");
  
  // Roda a cada 60.000 ms (1 minuto) para manter a agilidade que o usuário aceitou
  retryInterval = setInterval(processPendingMessages, 60000);
}

export function stopRetryWorker() {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
}
