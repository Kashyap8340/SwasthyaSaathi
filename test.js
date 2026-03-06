import { OpenRouter } from "@openrouter/sdk";
import 'dotenv/config';

const openrouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY
});

async function main() {
    try {
        const stream = await openrouter.chat.send({
            model: "arcee-ai/trinity-large-preview:free",
            messages: [
                {
                    role: "user",
                    content: "How many r's are in the word 'strawberry'?"
                }
            ],
            stream: true
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                process.stdout.write(content);
            }
        }
    } catch (e) {
        console.error("Openrouter Error:", e);
    }
}
main();
