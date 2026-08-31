import express from "express";
import db from "../database/db.js";
import { auth } from "../middleware/auth.js";
import { sendToAI } from "../services/ai.js";

const router = express.Router();


// ============================================================
// GET /api/chats
// Список чатов пользователя
// ============================================================

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


// ============================================================
// POST /api/chats
// Создание нового чата
// ============================================================

router.post("/", auth, (req, res) => {
    const {
        title = "Новый чат",
        model_id = null
    } = req.body;

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


// ============================================================
// GET /api/chats/:id
// Получение чата + истории сообщений
// ============================================================

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
        ORDER BY created_at ASC, id ASC
    `).all(chat.id);

    res.json({
        chat,
        messages
    });
});


// ============================================================
// POST /api/chats/:id/messages
// Отправка сообщения в AI
// ============================================================

router.post("/:id/messages", auth, async (req, res) => {
    try {
        const chatId = Number(req.params.id);
        const content = String(req.body?.content ?? "").trim();

        // --------------------------------------------------------
        // Проверяем сообщение
        // --------------------------------------------------------

        if (!content) {
            return res.status(400).json({
                error: "Сообщение не может быть пустым"
            });
        }

        // --------------------------------------------------------
        // Проверяем чат и владельца
        // --------------------------------------------------------

        const chat = db.prepare(`
            SELECT
                id,
                user_id,
                title,
                model_id
            FROM chats
            WHERE id = ? AND user_id = ?
        `).get(
            chatId,
            req.user.id
        );

        if (!chat) {
            return res.status(404).json({
                error: "Чат не найден"
            });
        }

        // --------------------------------------------------------
        // Проверяем выбранную модель
        // --------------------------------------------------------

        if (!chat.model_id) {
            return res.status(400).json({
                error: "Для этого чата не выбрана модель"
            });
        }

        const model = db.prepare(`
            SELECT
                id,
                name,
                model_id,
                base_url,
                api_key,
                enabled
            FROM models
            WHERE id = ?
        `).get(chat.model_id);

        if (!model) {
            return res.status(404).json({
                error: "Модель не найдена"
            });
        }

        if (!model.enabled) {
            return res.status(400).json({
                error: "Эта модель отключена"
            });
        }

        // --------------------------------------------------------
        // Получаем предыдущую историю
        // --------------------------------------------------------

        const previousMessages = db.prepare(`
            SELECT
                role,
                content
            FROM messages
            WHERE chat_id = ?
            ORDER BY created_at ASC, id ASC
        `).all(chat.id);

        // --------------------------------------------------------
        // Сохраняем сообщение пользователя
        // --------------------------------------------------------

        const userMessageResult = db.prepare(`
            INSERT INTO messages
            (
                chat_id,
                role,
                content,
                model_id,
                input_tokens,
                output_tokens
            )
            VALUES (?, ?, ?, ?, 0, 0)
        `).run(
            chat.id,
            "user",
            content,
            model.id
        );

        const userMessageId = Number(
            userMessageResult.lastInsertRowid
        );

        // --------------------------------------------------------
        // Формируем историю для AI
        // --------------------------------------------------------

        const aiMessages = [
            ...previousMessages,
            {
                role: "user",
                content
            }
        ];

        // --------------------------------------------------------
        // Отправляем запрос в AI
        // --------------------------------------------------------

        const data = await sendToAI({
            baseUrl: model.base_url,
            apiKey: model.api_key,
            model: model.model_id,
            messages: aiMessages
        });

        // --------------------------------------------------------
        // Извлекаем ответ
        // --------------------------------------------------------

        const assistantContent =
            data?.choices?.[0]?.message?.content;

        if (
            typeof assistantContent !== "string" ||
            !assistantContent.trim()
        ) {
            throw new Error(
                "AI API не вернул текстовый ответ"
            );
        }

        // --------------------------------------------------------
        // Извлекаем usage
        // --------------------------------------------------------

        const inputTokens = Number(
            data?.usage?.prompt_tokens ?? 0
        );

        const outputTokens = Number(
            data?.usage?.completion_tokens ?? 0
        );

        // --------------------------------------------------------
        // Сохраняем ответ AI
        // --------------------------------------------------------

        const assistantMessageResult = db.prepare(`
            INSERT INTO messages
            (
                chat_id,
                role,
                content,
                model_id,
                input_tokens,
                output_tokens
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            chat.id,
            "assistant",
            assistantContent,
            model.id,
            inputTokens,
            outputTokens
        );

        const assistantMessageId = Number(
            assistantMessageResult.lastInsertRowid
        );

        // --------------------------------------------------------
        // Записываем использование токенов
        // --------------------------------------------------------

        db.prepare(`
            INSERT INTO usage
            (
                user_id,
                model_id,
                input_tokens,
                output_tokens
            )
            VALUES (?, ?, ?, ?)
        `).run(
            req.user.id,
            model.id,
            inputTokens,
            outputTokens
        );

        // --------------------------------------------------------
        // Обновляем время чата
        // --------------------------------------------------------

        db.prepare(`
            UPDATE chats
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(chat.id);

        // --------------------------------------------------------
        // Если это первое сообщение —
        // автоматически создаём название чата
        // --------------------------------------------------------

        const messageCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM messages
            WHERE chat_id = ?
        `).get(chat.id);

        if (
            messageCount.count === 2 &&
            (!chat.title || chat.title === "Новый чат")
        ) {
            const newTitle =
                content.length > 60
                    ? content.slice(0, 57) + "..."
                    : content;

            db.prepare(`
                UPDATE chats
                SET
                    title = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                newTitle,
                chat.id
            );
        }

        // --------------------------------------------------------
        // Получаем сохранённые сообщения
        // --------------------------------------------------------

        const userMessage = db.prepare(`
            SELECT
                id,
                role,
                content,
                model_id,
                input_tokens,
                output_tokens,
                created_at
            FROM messages
            WHERE id = ?
        `).get(userMessageId);

        const assistantMessage = db.prepare(`
            SELECT
                id,
                role,
                content,
                model_id,
                input_tokens,
                output_tokens,
                created_at
            FROM messages
            WHERE id = ?
        `).get(assistantMessageId);

        // --------------------------------------------------------
        // Ответ frontend
        // --------------------------------------------------------

        res.json({
            user_message: userMessage,

            assistant_message: assistantMessage,

            usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: inputTokens + outputTokens
            },

            model: {
                id: model.id,
                name: model.name,
                model_id: model.model_id
            }
        });

    } catch (error) {
        console.error(
            "CHAT AI ERROR:",
            error
        );

        res.status(500).json({
            error:
                error?.message ||
                "Ошибка при обращении к AI"
        });
    }
});


// ============================================================
// PATCH /api/chats/:id
// Изменение названия / модели
// ============================================================

router.patch("/:id", auth, (req, res) => {
    const {
        title,
        model_id
    } = req.body;

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

    res.json({
        success: true
    });
});


// ============================================================
// DELETE /api/chats/:id
// Удаление чата
// ============================================================

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
