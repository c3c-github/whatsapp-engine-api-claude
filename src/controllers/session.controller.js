import prisma from "../lib/prisma.js";
import { initSocket, getSocketInfo, terminateSocket } from "../services/whatsapp.service.js";
import { createEvent } from "../services/event-log.service.js";

async function resolveChannel(req, res) {
  const channel = await prisma.channel.findFirst({ where: { id: req.params.id, org_id: req.org.id } });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return null; }
  return channel;
}

async function login(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  try {
    await initSocket(channel);
    await new Promise((r) => setTimeout(r, 2000));
    const info = getSocketInfo(channel.id);
    const updatedChannel = await prisma.channel.findUnique({ where: { id: channel.id } });
    if (updatedChannel.status === "AWAITING_QR" && info?.qrCode) return res.json({ status: "AWAITING_QR", qr_code: info.qrCode });
    if (updatedChannel.status === "CONNECTED") return res.json({ status: "CONNECTED" });
    return res.json({ status: updatedChannel.status });
  } catch (err) {
    console.error("[Session] login:", err);
    return res.status(500).json({ error: "Failed to initialize socket" });
  }
}

async function getStatus(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  try {
    const info = getSocketInfo(channel.id);
    const updatedChannel = await prisma.channel.findUnique({ where: { id: channel.id } });
    const response = { status: updatedChannel.status };
    if (updatedChannel.status === "AWAITING_QR" && info?.qrCode) response.qr_code = info.qrCode;
    return res.json(response);
  } catch (err) {
    console.error("[Session] getStatus:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function logout(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;
  try {
    await terminateSocket(channel.id);
    await prisma.session.deleteMany({ where: { channel_id: channel.id } });
    await prisma.channel.update({ where: { id: channel.id }, data: { status: "DISCONNECTED" } });
    await createEvent({ org_id: channel.org_id, entity_type: "SESSION", entity_id: channel.id, action: "DISCONNECTED", payload: { reason: "user_logout" } });
    return res.json({ success: true, status: "DISCONNECTED" });
  } catch (err) {
    console.error("[Session] logout:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getQRPage(req, res) {
  const channel = await resolveChannel(req, res);
  if (!channel) return;

  try {
    // Trigger login if socket not yet started
    const info = getSocketInfo(channel.id);
    if (!info?.sock) {
      initSocket(channel).catch((err) => console.error("[Session] QR initSocket:", err));
      await new Promise((r) => setTimeout(r, 2500));
    }

    const updatedChannel = await prisma.channel.findUnique({ where: { id: channel.id } });
    const socketInfo = getSocketInfo(channel.id);

    if (updatedChannel.status === "CONNECTED") {
      return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>WhatsApp Conectado</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4;}
.card{text-align:center;background:white;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);}
h1{color:#16a34a;font-size:2rem;margin-bottom:8px;}p{color:#4b5563;}</style></head>
<body><div class="card">
  <div style="font-size:4rem">✅</div>
  <h1>WhatsApp Conectado!</h1>
  <p>Canal <strong>${channel.id}</strong> está online.</p>
</div></body></html>`);
    }

    const qrCode = socketInfo?.qrCode;

    if (!qrCode) {
      return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta http-equiv="refresh" content="3"><title>Aguardando QR...</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fefce8;}
.card{text-align:center;background:white;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);}
h1{color:#ca8a04;}p{color:#4b5563;}.spinner{width:48px;height:48px;border:5px solid #e5e7eb;border-top-color:#ca8a04;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto;}
@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><div class="card">
  <div class="spinner"></div>
  <h1>Gerando QR Code...</h1>
  <p>Aguarde. Esta página atualiza automaticamente.</p>
</div></body></html>`);
    }

    const apiKey = req.headers["x-api-key"] || req.query.api_key;
    return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<meta http-equiv="refresh" content="5;url=/api/channels/${channel.id}/qr?api_key=${apiKey}">
<title>Escanear QR — WhatsApp Engine</title>
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #ece9e6, #ffffff); }
.card { text-align: center; background: white; padding: 40px 48px; border-radius: 20px; box-shadow: 0 8px 40px rgba(0,0,0,.12); max-width: 440px; width: 100%; }
h1 { color: #111827; font-size: 1.4rem; margin: 8px 0 4px; }
.sub { color: #6b7280; font-size: 0.85rem; margin: 0 0 24px; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
.qr-wrap { background: #f9fafb; border-radius: 16px; padding: 20px; display: inline-block; margin-bottom: 16px; border: 2px dashed #e5e7eb; }
img { display: block; width: 240px; height: 240px; }
.badge { display: inline-block; background: #fef9c3; color: #854d0e; border-radius: 99px; font-size: 0.78rem; padding: 4px 12px; margin-bottom: 20px; }
.steps { text-align: left; background: #f9fafb; border-radius: 12px; padding: 14px 20px; font-size: 0.84rem; color: #374151; line-height: 1.7; }
.refresh { font-size: 0.76rem; color: #9ca3af; margin-top: 16px; }
</style></head>
<body>
<div class="card">
  <div style="font-size:2.5rem">📱</div>
  <h1>Conectar WhatsApp</h1>
  <p class="sub">Canal: <code>${channel.id}</code></p>
  <div class="qr-wrap">
    <img src="${qrCode}" alt="QR Code WhatsApp" />
  </div>
  <div class="badge">⏳ Expira em ~60s — atualiza automaticamente</div>
  <div class="steps">
    <ol>
      <li>Abra o <strong>WhatsApp</strong> no celular</li>
      <li>Toque em <strong>⋮ → Dispositivos conectados</strong></li>
      <li>Toque em <strong>"Conectar dispositivo"</strong></li>
      <li>Aponte a câmera para o QR acima ☝️</li>
    </ol>
  </div>
  <p class="refresh">🔄 Página atualiza em 5 segundos...</p>
</div>
</body></html>`);
  } catch (err) {
    console.error("[Session] getQRPage:", err);
    return res.status(500).send("<h1>Erro ao gerar QR Code</h1>");
  }
}

export { login, getStatus, logout, getQRPage };
