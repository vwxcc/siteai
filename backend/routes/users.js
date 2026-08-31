import express from "express";
import db from "../database/db.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

router.get("/me", auth, (req, res) => {
    const user = db.prepare(`
        SELECT id, username, email, role, created_at
        FROM users
        WHERE id = ?
    `).get(req.user.id);

    res.json(user);
});

export default router;
