import "dotenv/config";
import express from "express";

// Prevent server crash on unhandled Baileys errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

import organizationRoutes from "./src/routes/organization.routes.js";
import channelRoutes from "./src/routes/channel.routes.js";
import sessionRoutes from "./src/routes/session.routes.js";
import messageRoutes from "./src/routes/message.routes.js";
import contactRoutes from "./src/routes/contact.routes.js";
import groupRoutes from "./src/routes/group.routes.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/organizations", organizationRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/channels/:id", sessionRoutes);
app.use("/api/channels/:id/messages", messageRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/channels/:id/groups", groupRoutes);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", app: "whatsapp-engine-api", version: "2.0.0", timestamp: new Date().toISOString() });
});

// ── 404 / Error handlers ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, async () => {
  console.log(`[WhatsApp Engine API v2] Running on port ${PORT}`);

  // Auto-initialize channels that were active
  try {
    const { initSocket } = await import("./src/services/whatsapp.service.js");
    const prisma = (await import("./src/lib/prisma.js")).default;
    
    const activeChannels = await prisma.channel.findMany({
      where: { status: { in: ["CONNECTED", "AWAITING_QR"] } },
    });

    if (activeChannels.length > 0) {
      console.log(`[Startup] Restoring ${activeChannels.length} active channels...`);
      for (const channel of activeChannels) {
        initSocket(channel).catch((err) =>
          console.error(`[Startup] Failed to restore channel ${channel.id}:`, err.message)
        );
      }
    }
  } catch (err) {
    console.error("[Startup] Error during channel restoration:", err);
  }
});
