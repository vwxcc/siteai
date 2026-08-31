import express from "express";
import db from "../database/db.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

router.get("/", auth, (req, res) => {
    const models = db.prepare(`
        SELECT
            id,
            name,
            model_id,
            enabled
        FROM models
        WHERE enabled = 1
          AND manually_added = 1
        ORDER BY name
    `).all();

    res.json(models);
});

export default router;
