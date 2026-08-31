export async function sendToAI({
    baseUrl,
    apiKey,
    model,
    messages
}) {
    // ------------------------------------------------------------
    // Нормализуем Base URL
    // ------------------------------------------------------------

    let normalizedBaseUrl =
        String(baseUrl ?? "")
            .trim()
            .replace(/^["']+|["']+$/g, "")
            .replace(/\/+$/, "");

    if (!normalizedBaseUrl) {
        throw new Error("Base URL модели пустой");
    }

    // ------------------------------------------------------------
    // Формируем полный URL
    // ------------------------------------------------------------

    const endpoint =
        `${normalizedBaseUrl}/chat/completions`;

    let url;

    try {
        url = new URL(endpoint);
    } catch (error) {
        throw new Error(
            `Некорректный Base URL: ${JSON.stringify(baseUrl)}`
        );
    }

    if (
        url.protocol !== "http:" &&
        url.protocol !== "https:"
    ) {
        throw new Error(
            `Неподдерживаемый протокол Base URL: ${url.protocol}`
        );
    }

    console.log("AI REQUEST:", {
        baseUrl: normalizedBaseUrl,
        endpoint: url.href,
        model
    });

    // ------------------------------------------------------------
    // Запрос
    // ------------------------------------------------------------

    const response = await fetch(
        url.href,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },

            body: JSON.stringify({
                model,
                messages,
                stream: false
            })
        }
    );

    const text =
        await response.text();

    console.log("AI RESPONSE:", {
        status: response.status,
        ok: response.ok,
        body: text.slice(0, 500)
    });

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `API вернул некорректный JSON (${response.status}): ${
                text.slice(0, 500)
            }`
        );
    }

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
            data?.message ||
            `AI API error: ${response.status}`
        );
    }

    return data;
}
