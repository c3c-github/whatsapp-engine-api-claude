import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { createGroup, updateGroup, listGroups, deleteGroup } from "../controllers/group.controller.js";

const router = Router({ mergeParams: true });
router.use(authenticate);
router.post("/", createGroup);
router.get("/", listGroups);
router.put("/:wa_group_id", updateGroup);
router.delete("/:wa_group_id", deleteGroup);
export default router;
