import express from "express";
import db from "../database/db.js";
import { auth } from "../middleware/auth.js";
import { sendToAI } from "../services/ai.js";
import multer from "multer";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 10,
        fileSize: 25 * 1024 * 1024
    }
});




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

router.post(
    "/:id/messages",
    auth,
    upload.array("files", 10),
    async (req, res) => {
    try {
        const chatId = Number(req.params.id);

        const content =
            String(req.body?.content ?? "").trim();

        const requestedModelId =
            req.body?.model_id
                ? Number(req.body.model_id)
                : null;

        const files =
            Array.isArray(req.files)
                ? req.files
                : [];

        // --------------------------------------------------------
        // Проверяем сообщение
        // --------------------------------------------------------

        if (!content && !files.length) {
            return res.status(400).json({
                error: "Сообщение и файлы не могут быть пустыми"
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
        // Если frontend явно передал модель —
        // закрепляем её за этим чатом
        // --------------------------------------------------------

        if (
            requestedModelId &&
            Number.isInteger(requestedModelId)
        ) {
            const requestedModel =
                db.prepare(`
                    SELECT id
                    FROM models
                    WHERE id = ?
                `).get(requestedModelId);

            if (requestedModel) {
                chat.model_id =
                    requestedModel.id;

                db.prepare(`
                    UPDATE chats
                    SET model_id = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                      AND user_id = ?
                `).run(
                    requestedModel.id,
                    chat.id,
                    req.user.id
                );
            }
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

        const storedContent =
            files.length
                ? [
                    content,
                    ...files.map(
                        file =>
                            `[Файл: ${file.originalname}]`
                    )
                ]
                    .filter(Boolean)
                    .join("\n\n")
                : content;

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
            storedContent,
            model.id
        );

        const userMessageId = Number(
            userMessageResult.lastInsertRowid
        );

        // --------------------------------------------------------
        // Формируем содержимое прикреплённых файлов
        // --------------------------------------------------------

        const fileParts = [];

        for (const file of files) {

            const name =
                file.originalname || "файл";

            const type =
                file.mimetype || "application/octet-stream";

            const lowerName =
                name.toLowerCase();

            const isImage =
                type.startsWith("image/");

            const isText =
                type.startsWith("text/") ||
                /\.(txt|md|csv|json|js|ts|jsx|tsx|py|java|c|cpp|h|hpp|css|html|xml|yaml|yml|sql|sh|log)$/i
                    .test(lowerName);

            if (isImage) {

                const base64 =
                    file.buffer.toString("base64");

                fileParts.push({
                    type: "image_url",
                    image_url: {
                        url:
                            `data:${type};base64,${base64}`
                    }
                });

                continue;
            }

            if (isText) {

                const textFile =
                    file.buffer.toString("utf8");

                fileParts.push({
                    type: "text",
                    text:
                        `Файл: ${name}\n\n${textFile}`
                });

                continue;
            }

            fileParts.push({
                type: "text",
                text:
                    `Прикреплён файл "${name}" (${type}). ` +
                    `Его содержимое не было извлечено сервером.`
            });
        }

        const userContent =
            fileParts.length
                ? [
                    ...(content
                        ? [{
                            type: "text",
                            text: content
                        }]
                        : []),
                    ...fileParts
                ]
                : content;

        // --------------------------------------------------------
        // Формируем историю для AI
        // --------------------------------------------------------

        const aiMessages = [
            ...previousMessages,
            {
                role: "user",
                content: userContent
            }
        ];

        // --------------------------------------------------------
        // Отправляем запрос в AI
        // --------------------------------------------------------

        console.log("AI DEBUG:", {
            modelId: model.id,
            modelName: model.name,
            modelBaseUrl: JSON.stringify(model.base_url),
            modelApiModel: model.model_id
        });

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
            const titleSource =
                content ||
                (files.length
                    ? files[0].originalname
                    : "Новый чат");

            const newTitle =
                titleSource.length > 60
                    ? titleSource.slice(0, 57) + "..."
                    : titleSource;

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

        const status =
            error?.code === "LIMIT_FILE_SIZE"
                ? 413
                : 500;

        res.status(status).json({
            error:
                error?.code === "LIMIT_FILE_SIZE"
                    ? "Файл слишком большой. Максимальный размер — 25 МБ."
                    : (
                        error?.message ||
                        "Ошибка при обращении к AI"
                    )
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
