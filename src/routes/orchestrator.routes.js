import { Router } from "express";
import { orchestratorSendMessage } from "../controllers/orchestrator.controller.js";

const router = Router();

// Rota para o Orchestrator enviar a resposta da Inteligência Artificial
router.post("/send", orchestratorSendMessage);

export default router;
