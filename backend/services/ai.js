export async function sendToAI({
    baseUrl,
    apiKey,
    model,
    messages
}) {
    const url = baseUrl.replace(/\/+$/, "");

    const response = await fetch(
        `${url}/chat/completions`,
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

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            "API вернул некорректный JSON"
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
