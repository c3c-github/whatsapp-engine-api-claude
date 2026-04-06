import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { login, getStatus, logout, getQRPage } from "../controllers/session.controller.js";

const router = Router({ mergeParams: true });
router.use(authenticate);

router.post("/login", login);
router.get("/status", getStatus);
router.post("/logout", logout);
router.get("/qr", getQRPage);   // ← página HTML com QR code

export default router;
