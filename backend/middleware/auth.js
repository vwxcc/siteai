import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export function auth(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Требуется авторизация"
        });
    }

    const token = header.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = decoded;

        next();
    } catch {
        return res.status(401).json({
            error: "Недействительная сессия"
        });
    }
}

export function adminOnly(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({
            error: "Доступ только для администратора"
        });
    }

    next();
}
