import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { createChannel, listChannels, getChannel } from "../controllers/channel.controller.js";

const router = Router();
router.use(authenticate);
router.post("/", createChannel);
router.get("/", listChannels);
router.get("/:id", getChannel);
export default router;
