import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Configuração via variáveis de ambiente ────────────────────────────────────
// EVENTLOG_RETENTION_DAYS      → retenção geral do EventLog (padrão: 30 dias)
// EVENTLOG_DISCONNECTED_DAYS   → retenção de eventos DISCONNECTED (padrão: 3 dias)
const RETENTION_DAYS       = parseInt(process.env.EVENTLOG_RETENTION_DAYS      || "30", 10);
const DISCONNECTED_DAYS    = parseInt(process.env.EVENTLOG_DISCONNECTED_DAYS   || "3",  10);

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function run() {
  const startedAt = new Date();
  console.log(`[cleanup-eventlog] Iniciando em ${startedAt.toISOString()}`);
  console.log(`  → Retenção geral:       ${RETENTION_DAYS} dias`);
  console.log(`  → Retenção DISCONNECTED: ${DISCONNECTED_DAYS} dias`);

  let totalDeleted = 0;

  // 1. Remove eventos DISCONNECTED de SESSION mais antigos que DISCONNECTED_DAYS
  const deletedDisconnected = await prisma.eventLog.deleteMany({
    where: {
      action:      "DISCONNECTED",
      entity_type: "SESSION",
      created_at:  { lt: daysAgo(DISCONNECTED_DAYS) },
    },
  });
  console.log(`  ✅ DISCONNECTED SESSION removidos: ${deletedDisconnected.count}`);
  totalDeleted += deletedDisconnected.count;

  // 2. Remove qualquer evento mais antigo que RETENTION_DAYS (retenção geral)
  const deletedOld = await prisma.eventLog.deleteMany({
    where: {
      created_at: { lt: daysAgo(RETENTION_DAYS) },
    },
  });
  console.log(`  ✅ Eventos antigos (>${RETENTION_DAYS}d) removidos: ${deletedOld.count}`);
  totalDeleted += deletedOld.count;

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(2);
  console.log(`[cleanup-eventlog] Concluído em ${elapsed}s — total removido: ${totalDeleted} registros`);
}

run()
  .catch((err) => {
    console.error("[cleanup-eventlog] Erro:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
