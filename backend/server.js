import "dotenv/config";

import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import chatsRoutes from "./routes/chats.js";
import modelsRoutes from "./routes/models.js";
import adminRoutes from "./routes/admin.js";
import analyticsRoutes from "./routes/analytics.js";

const app = express();

const PORT = Number(process.env.PORT || 3000);

app.use(cors());

app.use(express.json({
    limit: "2mb"
}));

app.use(express.urlencoded({
    extended: true
}));

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "siteai-backend"
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/auth", usersRoutes);
app.use("/api/chats", chatsRoutes);
app.use("/api/models", modelsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/analytics", analyticsRoutes);

app.use((req, res) => {
    res.status(404).json({
        error: "Endpoint не найден"
    });
});

app.use((error, req, res, next) => {
    console.error(error);

    res.status(500).json({
        error: "Внутренняя ошибка сервера"
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `SiteAI backend started on port ${PORT}`
    );
});
