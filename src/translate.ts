export class DeepLConnect {
    async translate(messages: string[], apiKey: string): Promise<string[]> {
        if (!apiKey) {
            return messages;
        }

        const endpoint = apiKey.endsWith(':fx')
            ? 'https://api-free.deepl.com/v2/translate'
            : 'https://api.deepl.com/v2/translate';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `DeepL-Auth-Key ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: messages,
                source_lang: 'JA',
                target_lang: 'EN-US'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepL API request failed (${response.status}): ${errorText}`);
        }

        const data = await response.json() as { translations?: Array<{ text?: string }> };
        const translations = data.translations ?? [];
        return translations.map(item => item.text ?? '').filter((text) => text.length > 0);
    }
}
