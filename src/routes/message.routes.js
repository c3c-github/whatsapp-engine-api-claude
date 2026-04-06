import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { sendMessage, editMessage, deleteMessage, listOutbound, listInbound, deleteInbound } from "../controllers/message.controller.js";

const router = Router({ mergeParams: true });
router.use(authenticate);
router.post("/", sendMessage);
router.get("/", listOutbound);
router.get("/inbound", listInbound);
router.put("/:wa_message_id", editMessage);
router.delete("/inbound/:wa_message_id", deleteInbound);
router.delete("/:wa_message_id", deleteMessage);
export default router;
