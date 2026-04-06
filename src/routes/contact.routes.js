import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { createContact, listContacts, updateContact, deleteContact } from "../controllers/contact.controller.js";

const router = Router();
router.use(authenticate);
router.post("/", createContact);
router.get("/", listContacts);
router.put("/:id", updateContact);
router.delete("/:id", deleteContact);
export default router;
