import express from "express";
import db from "../database/db.js";
import { auth, adminOnly } from "../middleware/auth.js";

const router = express.Router();

router.use(auth);
router.use(adminOnly);

router.get("/users", (req, res) => {
    const users = db.prepare(`
        SELECT
            id,
            username,
            email,
            role,
            created_at
        FROM users
        ORDER BY created_at DESC
    `).all();

    res.json(users);
});

router.post("/models", (req, res) => {
    const {
        name,
        model_id,
        base_url,
        api_key
    } = req.body;

    if (!name || !model_id || !base_url || !api_key) {
        return res.status(400).json({
            error: "Необходимо заполнить все поля"
        });
    }

    const result = db.prepare(`
        INSERT INTO models
        (name, model_id, base_url, api_key, manually_added)
        VALUES (?, ?, ?, ?, 1)
    `).run(
        name,
        model_id,
        base_url,
        api_key
    );

    res.json({
        id: result.lastInsertRowid,
        success: true
    });
});

router.get("/models", (req, res) => {
    const models = db.prepare(`
        SELECT
            id,
            name,
            model_id,
            base_url,
            enabled,
            created_at
        FROM models
        ORDER BY created_at DESC
    `).all();

    res.json(models);
});

router.patch("/models/:id", (req, res) => {
    const {
        name,
        model_id,
        base_url,
        api_key,
        enabled
    } = req.body;

    db.prepare(`
        UPDATE models
        SET
            name = COALESCE(?, name),
            model_id = COALESCE(?, model_id),
            base_url = COALESCE(?, base_url),
            api_key = COALESCE(?, api_key),
            enabled = COALESCE(?, enabled)
        WHERE id = ?
    `).run(
        name ?? null,
        model_id ?? null,
        base_url ?? null,
        api_key ?? null,
        enabled ?? null,
        req.params.id
    );

    res.json({
        success: true
    });
});

router.delete("/models/:id", (req, res) => {
    const modelId = Number(req.params.id);

    if (!Number.isInteger(modelId)) {
        return res.status(400).json({
            error: "Некорректный ID модели"
        });
    }

    const model = db.prepare(`
        SELECT id
        FROM models
        WHERE id = ?
    `).get(modelId);

    if (!model) {
        return res.status(404).json({
            error: "Модель не найдена"
        });
    }

    // Не удаляем запись физически:
    // на модель могут ссылаться старые чаты, сообщения и статистика.
    // Вместо этого полностью скрываем её из доступных моделей.
    db.prepare(`
        UPDATE models
        SET
            enabled = 0,
            manually_added = 0
        WHERE id = ?
    `).run(modelId);

    res.json({
        success: true
    });
});

export default router;
