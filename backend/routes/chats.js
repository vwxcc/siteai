import express from "express";
import db from "../database/db.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

router.get("/", auth, (req, res) => {
    const chats = db.prepare(`
        SELECT
            id,
            title,
            model_id,
            created_at,
            updated_at
        FROM chats
        WHERE user_id = ?
        ORDER BY updated_at DESC
    `).all(req.user.id);

    res.json(chats);
});

router.post("/", auth, (req, res) => {
    const { title = "Новый чат", model_id = null } = req.body;

    const result = db.prepare(`
        INSERT INTO chats
        (user_id, title, model_id)
        VALUES (?, ?, ?)
    `).run(
        req.user.id,
        title,
        model_id
    );

    const chat = db.prepare(`
        SELECT *
        FROM chats
        WHERE id = ?
    `).get(result.lastInsertRowid);

    res.json(chat);
});

router.get("/:id", auth, (req, res) => {
    const chat = db.prepare(`
        SELECT *
        FROM chats
        WHERE id = ? AND user_id = ?
    `).get(
        req.params.id,
        req.user.id
    );

    if (!chat) {
        return res.status(404).json({
            error: "Чат не найден"
        });
    }

    const messages = db.prepare(`
        SELECT
            id,
            role,
            content,
            model_id,
            input_tokens,
            output_tokens,
            created_at
        FROM messages
        WHERE chat_id = ?
        ORDER BY created_at ASC
    `).all(chat.id);

    res.json({
        chat,
        messages
    });
});

router.patch("/:id", auth, (req, res) => {
    const { title, model_id } = req.body;

    const chat = db.prepare(`
        SELECT id
        FROM chats
        WHERE id = ? AND user_id = ?
    `).get(
        req.params.id,
        req.user.id
    );

    if (!chat) {
        return res.status(404).json({
            error: "Чат не найден"
        });
    }

    db.prepare(`
        UPDATE chats
        SET
            title = COALESCE(?, title),
            model_id = COALESCE(?, model_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        title ?? null,
        model_id ?? null,
        chat.id
    );

    res.json({ success: true });
});

router.delete("/:id", auth, (req, res) => {
    const result = db.prepare(`
        DELETE FROM chats
        WHERE id = ? AND user_id = ?
    `).run(
        req.params.id,
        req.user.id
    );

    if (!result.changes) {
        return res.status(404).json({
            error: "Чат не найден"
        });
    }

    res.json({
        success: true
    });
});

export default router;
