import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../database/db.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role
        },
        JWT_SECRET,
        {
            expiresIn: "30d"
        }
    );
}

router.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                error: "Заполните все поля"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: "Пароль должен содержать минимум 6 символов"
            });
        }

        const exists = db.prepare(`
            SELECT id
            FROM users
            WHERE email = ? OR username = ?
        `).get(email, username);

        if (exists) {
            return res.status(409).json({
                error: "Пользователь уже существует"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = db.prepare(`
            INSERT INTO users
            (username, email, password_hash)
            VALUES (?, ?, ?)
        `).run(
            username,
            email,
            passwordHash
        );

        const user = db.prepare(`
            SELECT id, username, email, role
            FROM users
            WHERE id = ?
        `).get(result.lastInsertRowid);

        const token = createToken(user);

        res.json({
            token,
            user
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Ошибка регистрации"
        });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
        `).get(email);

        if (!user) {
            return res.status(401).json({
                error: "Неверный email или пароль"
            });
        }

        const valid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!valid) {
            return res.status(401).json({
                error: "Неверный email или пароль"
            });
        }

        const publicUser = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        const token = createToken(publicUser);

        res.json({
            token,
            user: publicUser
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Ошибка входа"
        });
    }
});

export default router;
