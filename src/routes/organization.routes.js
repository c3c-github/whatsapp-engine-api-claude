import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { createOrganization, getOrganization } from "../controllers/organization.controller.js";

const router = Router();
router.post("/", createOrganization);
router.get("/:id", authenticate, getOrganization);
export default router;
