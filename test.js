/**
 * WhatsApp Engine API — Test Script
 *
 * Testa todos os módulos da API em sequência.
 * Requer: servidor rodando + PostgreSQL configurado.
 *
 * Uso:
 *   node test.js
 *   node test.js --base-url http://localhost:3001
 */

const BASE_URL = (() => {
  const idx = process.argv.indexOf("--base-url");
  return idx !== -1 ? process.argv[idx + 1] : "http://localhost:3000";
})();

// ── ANSI colors ───────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

let passed = 0;
let failed = 0;
const errors = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function section(title) {
  console.log(`\n${c.bold}${c.cyan}── ${title} ${"─".repeat(50 - title.length)}${c.reset}`);
}

function ok(label, detail = "") {
  passed++;
  console.log(`  ${c.green}✓${c.reset} ${label}${detail ? c.dim + "  " + detail + c.reset : ""}`);
}

function fail(label, detail = "") {
  failed++;
  const msg = `  ${c.red}✗${c.reset} ${label}${detail ? c.dim + "  " + detail + c.reset : ""}`;
  console.log(msg);
  errors.push({ label, detail });
}

function skip(label, reason = "") {
  console.log(`  ${c.yellow}⊘${c.reset} ${c.dim}SKIP${c.reset} ${label}${reason ? c.dim + "  (" + reason + ")" + c.reset : ""}`);
}

async function req(method, path, { body, headers = {} } = {}) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function assert(condition, label, detail = "") {
  if (condition) ok(label, detail);
  else fail(label, detail);
  return condition;
}

// ── Test State ────────────────────────────────────────────────────────────────
let ORG_ID, API_KEY, CHANNEL_ID, CONTACT_ID;

// ── TESTS ─────────────────────────────────────────────────────────────────────

async function testHealthCheck() {
  section("Health Check");
  const { status, data } = await req("GET", "/");
  assert(status === 200, "GET / returns 200", `status=${status}`);
  assert(data?.status === "ok", "Body has status=ok", JSON.stringify(data));
}

async function testCreateOrganization() {
  section("Module 1 — Organizations");

  // Missing name → 400
  const bad = await req("POST", "/api/organizations", { body: {} });
  assert(bad.status === 400, "POST /api/organizations without name → 400");

  // Success
  const { status, data } = await req("POST", "/api/organizations", {
    body: { name: "Test Org (script)", webhook_url: "https://example.com/hook" },
  });

  if (!assert(status === 201, "POST /api/organizations → 201", `status=${status}`)) return;
  assert(typeof data.api_key === "string" && data.api_key.length > 0, "Response includes api_key");
  assert(data.name === "Test Org (script)", "Response name matches");

  ORG_ID = data.id;
  API_KEY = data.api_key;
  console.log(`    ${c.dim}org_id=${ORG_ID}  api_key=${API_KEY}${c.reset}`);
}

async function testGetOrganization() {
  if (!API_KEY) return skip("GET /api/organizations/:id", "no org created");

  // No auth → 401
  const unauth = await req("GET", `/api/organizations/${ORG_ID}`);
  assert(unauth.status === 401, "GET /api/organizations/:id without auth → 401");

  // Wrong org → 403
  const wrong = await req("GET", "/api/organizations/00000000-0000-0000-0000-000000000000", {
    headers: { "x-api-key": API_KEY },
  });
  assert(wrong.status === 403, "GET /api/organizations/:other-id → 403 (forbidden)");

  // Own org
  const { status, data } = await req("GET", `/api/organizations/${ORG_ID}`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(status === 200, "GET /api/organizations/:id (own) → 200");
  assert(data.id === ORG_ID, "Response id matches");
}

async function testChannels() {
  section("Module 1 — Channels");
  if (!API_KEY) return skip("All channel tests", "no org created");

  // No auth → 401
  const unauth = await req("GET", "/api/channels");
  assert(unauth.status === 401, "GET /api/channels without auth → 401");

  // Create channel — missing phone_number → 400
  const bad = await req("POST", "/api/channels", {
    headers: { "x-api-key": API_KEY },
    body: { type: "CENTRAL" },
  });
  assert(bad.status === 400, "POST /api/channels without phone_number → 400");

  // Create channel success
  const { status, data } = await req("POST", "/api/channels", {
    headers: { "x-api-key": API_KEY },
    body: { phone_number: "5511999990001", type: "CENTRAL" },
  });
  if (!assert(status === 201, "POST /api/channels → 201", `status=${status}`)) return;
  assert(data.status === "DISCONNECTED", "New channel status is DISCONNECTED");
  assert(data.type === "CENTRAL", "Channel type=CENTRAL");

  CHANNEL_ID = data.id;
  console.log(`    ${c.dim}channel_id=${CHANNEL_ID}${c.reset}`);

  // Duplicate phone_number → 409
  const dup = await req("POST", "/api/channels", {
    headers: { "x-api-key": API_KEY },
    body: { phone_number: "5511999990001", type: "CENTRAL" },
  });
  assert(dup.status === 409, "Duplicate phone_number → 409");

  // List channels
  const list = await req("GET", "/api/channels", {
    headers: { "x-api-key": API_KEY },
  });
  assert(list.status === 200, "GET /api/channels → 200");
  assert(Array.isArray(list.data), "Response is array");
  assert(list.data.some((c) => c.id === CHANNEL_ID), "Created channel appears in list");

  // Get single channel
  const single = await req("GET", `/api/channels/${CHANNEL_ID}`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(single.status === 200, "GET /api/channels/:id → 200");
  assert(single.data.id === CHANNEL_ID, "Correct channel returned");
}

async function testSessionStatus() {
  section("Module 2 — Session");
  if (!CHANNEL_ID) return skip("Session tests", "no channel created");

  // Status of a disconnected channel
  const { status, data } = await req("GET", `/api/channels/${CHANNEL_ID}/status`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(status === 200, "GET /api/channels/:id/status → 200");
  assert(data.status === "DISCONNECTED", "Disconnected channel shows DISCONNECTED");

  // LOGIN test — initiates Baileys (may return QR or error if WA unreachable)
  console.log(`\n  ${c.yellow}ℹ${c.reset}  Calling /login — this starts Baileys socket...`);
  const login = await req("POST", `/api/channels/${CHANNEL_ID}/login`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(
    [200, 500].includes(login.status),
    `POST /api/channels/:id/login → ${login.status} (200=QR/connected, 500=no internet)`,
    login.data?.status || login.data?.error
  );

  if (login.status === 200 && login.data?.status === "AWAITING_QR") {
    assert(
      typeof login.data.qr_code === "string" && login.data.qr_code.startsWith("data:image"),
      "QR code is base64 image"
    );
    console.log(`\n  ${c.yellow}   ⚠ Scan the QR code at:${c.reset}`);
    console.log(`      data:image/png;base64,...  (${login.data.qr_code.length} chars)`);
    console.log(`  ${c.dim}  Copy qr_code value and open in browser or image viewer.${c.reset}`);
  }

  // Logout (works even if disconnected — should not crash)
  const logout = await req("POST", `/api/channels/${CHANNEL_ID}/logout`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(logout.status === 200, "POST /api/channels/:id/logout → 200");
  assert(logout.data?.status === "DISCONNECTED", "After logout status=DISCONNECTED");
}

async function testMessages() {
  section("Module 3 & 4 — Messages");
  if (!CHANNEL_ID) return skip("Message tests", "no channel created");

  // Send message to a disconnected channel → 409
  const noConn = await req("POST", `/api/channels/${CHANNEL_ID}/messages`, {
    headers: { "x-api-key": API_KEY },
    body: { to: "5511988887777@s.whatsapp.net", content: "test" },
  });
  assert(noConn.status === 409, "Send on disconnected channel → 409 (expected)");

  // List outbound
  const outList = await req("GET", `/api/channels/${CHANNEL_ID}/messages`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(outList.status === 200, "GET /api/channels/:id/messages → 200");
  assert(typeof outList.data?.total === "number", "Outbound list has 'total' field");

  // List inbound
  const inList = await req("GET", `/api/channels/${CHANNEL_ID}/messages/inbound`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(inList.status === 200, "GET /api/channels/:id/messages/inbound → 200");
  assert(typeof inList.data?.total === "number", "Inbound list has 'total' field");

  // Delete non-existent inbound → 404
  const delNone = await req(
    "DELETE",
    `/api/channels/${CHANNEL_ID}/messages/inbound/non-existent-id`,
    { headers: { "x-api-key": API_KEY } }
  );
  assert(delNone.status === 404, "DELETE non-existent inbound message → 404");
}

async function testContacts() {
  section("Module 5 — Contacts");
  if (!API_KEY) return skip("Contact tests", "no org created");

  // Missing fields → 400
  const bad = await req("POST", "/api/contacts", {
    headers: { "x-api-key": API_KEY },
    body: { name: "No Phone" },
  });
  assert(bad.status === 400, "POST /api/contacts without phone_number → 400");

  // Create contact
  const { status, data } = await req("POST", "/api/contacts", {
    headers: { "x-api-key": API_KEY },
    body: { name: "João Teste", phone_number: "5511988880001@s.whatsapp.net" },
  });
  if (!assert(status === 201, "POST /api/contacts → 201", `status=${status}`)) return;
  assert(data.name === "João Teste", "Contact name correct");
  CONTACT_ID = data.id;

  // Duplicate → 409
  const dup = await req("POST", "/api/contacts", {
    headers: { "x-api-key": API_KEY },
    body: { name: "Duplicate", phone_number: "5511988880001@s.whatsapp.net" },
  });
  assert(dup.status === 409, "Duplicate phone_number → 409");

  // List contacts
  const list = await req("GET", "/api/contacts", {
    headers: { "x-api-key": API_KEY },
  });
  assert(list.status === 200, "GET /api/contacts → 200");
  assert(Array.isArray(list.data), "Response is array");
  assert(list.data.some((c) => c.id === CONTACT_ID), "Created contact in list");

  // Search
  const search = await req("GET", "/api/contacts?search=João", {
    headers: { "x-api-key": API_KEY },
  });
  assert(search.status === 200, "GET /api/contacts?search=João → 200");
  assert(search.data.length > 0, "Search returned results");

  // Update contact
  const upd = await req("PUT", `/api/contacts/${CONTACT_ID}`, {
    headers: { "x-api-key": API_KEY },
    body: { name: "João Atualizado" },
  });
  assert(upd.status === 200, "PUT /api/contacts/:id → 200");
  assert(upd.data.name === "João Atualizado", "Name updated correctly");

  // Delete contact
  const del = await req("DELETE", `/api/contacts/${CONTACT_ID}`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(del.status === 204, "DELETE /api/contacts/:id → 204");

  // Confirm deleted
  const after = await req("DELETE", `/api/contacts/${CONTACT_ID}`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(after.status === 404, "DELETE already-deleted contact → 404");
}

async function testGroups() {
  section("Module 6 — Groups");
  if (!CHANNEL_ID) return skip("Group tests", "no channel created");

  // Create group on disconnected channel → 409
  const noConn = await req("POST", `/api/channels/${CHANNEL_ID}/groups`, {
    headers: { "x-api-key": API_KEY },
    body: { name: "Test Group", participants: ["5511988880001@s.whatsapp.net"] },
  });
  assert(noConn.status === 409, "Create group on disconnected channel → 409 (expected)");

  // List groups (should be empty array)
  const list = await req("GET", `/api/channels/${CHANNEL_ID}/groups`, {
    headers: { "x-api-key": API_KEY },
  });
  assert(list.status === 200, "GET /api/channels/:id/groups → 200");
  assert(Array.isArray(list.data), "Response is array");

  // Update non-existent group → 409 (not connected)
  const upd = await req("PUT", `/api/channels/${CHANNEL_ID}/groups/fake-group-id`, {
    headers: { "x-api-key": API_KEY },
    body: { name: "New Name" },
  });
  assert(upd.status === 409, "Update group on disconnected channel → 409 (expected)");
}

async function testAuth() {
  section("Auth Middleware");

  // Invalid API key
  const inv = await req("GET", "/api/channels", {
    headers: { "x-api-key": "invalid-key-12345" },
  });
  assert(inv.status === 401, "Invalid api_key → 401");

  // Missing header
  const missing = await req("GET", "/api/contacts");
  assert(missing.status === 401, "Missing x-api-key → 401");

  // Unknown route
  const notFound = await req("GET", "/api/does-not-exist");
  assert(notFound.status === 404, "Unknown route → 404");
}

// ── Summary ───────────────────────────────────────────────────────────────────
function printSummary() {
  const total = passed + failed;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`${c.bold}Results:${c.reset}`);
  console.log(`  ${c.green}Passed:${c.reset} ${passed}/${total}`);
  if (failed > 0) {
    console.log(`  ${c.red}Failed:${c.reset} ${failed}/${total}`);
    console.log(`\n${c.red}${c.bold}Failures:${c.reset}`);
    for (const e of errors) {
      console.log(`  ${c.red}✗${c.reset} ${e.label}`);
      if (e.detail) console.log(`    ${c.dim}${e.detail}${c.reset}`);
    }
  } else {
    console.log(`\n${c.green}${c.bold}All tests passed! 🎉${c.reset}`);
  }
  console.log("═".repeat(60));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${c.bold}${c.cyan}WhatsApp Engine API — Test Suite${c.reset}`);
  console.log(`${c.dim}Base URL: ${BASE_URL}${c.reset}`);

  try {
    await testHealthCheck();
    await testCreateOrganization();
    await testGetOrganization();
    await testChannels();
    await testSessionStatus();
    await testMessages();
    await testContacts();
    await testGroups();
    await testAuth();
  } catch (err) {
    console.error(`\n${c.red}${c.bold}FATAL ERROR:${c.reset}`, err.message);
    console.error(c.dim + err.stack + c.reset);
    console.error(`\n${c.yellow}Hint: Is the server running? → npm run dev${c.reset}`);
    process.exit(1);
  }

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

main();
