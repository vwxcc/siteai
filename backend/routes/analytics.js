import express from "express";
import db from "../database/db.js";
import { auth, adminOnly } from "../middleware/auth.js";

const router = express.Router();

router.use(auth);
router.use(adminOnly);

router.get("/", (req, res) => {
    const users = db.prepare(`
        SELECT COUNT(*) AS count
        FROM users
    `).get().count;

    const chats = db.prepare(`
        SELECT COUNT(*) AS count
        FROM chats
    `).get().count;

    const messages = db.prepare(`
        SELECT COUNT(*) AS count
        FROM messages
    `).get().count;

    const usage = db.prepare(`
        SELECT
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens
        FROM usage
    `).get();

    const models = db.prepare(`
        SELECT COUNT(*) AS count
        FROM models
        WHERE enabled = 1
    `).get().count;

    res.json({
        users,
        chats,
        messages,
        models,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens:
            usage.input_tokens +
            usage.output_tokens
    });
});

export default router;
