import prisma from "../lib/prisma.js";

/**
 * Middleware: validate x-api-key header against Organization.api_key
 */
async function authenticate(req, res, next) {
  const apiKey = req.headers["x-api-key"] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: "Missing x-api-key header or api_key query param" });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { api_key: apiKey },
    });

    if (!org) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.org = org;
    next();
  } catch (err) {
    console.error("[Auth]", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export { authenticate };
