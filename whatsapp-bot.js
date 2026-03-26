import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import https from 'https';
import 'dotenv/config';

// 1. Initialize WhatsApp Client
// We use LocalAuth so you only need to scan the QR code once.
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

// 2. Generate and Scan QR Code
client.on('qr', (qr) => {
    // Generate the QR code in your terminal
    console.log('Scan this QR code with your regular WhatsApp App to connect your personal number (8340442589) to SwasthyaSaathi AI:');
    qrcode.generate(qr, { small: true });
});

// 3. Client Ready
client.on('ready', () => {
    console.log('✅ Client is ready! Your 8340442589 number is now officially the SwasthyaSaathi AI bot!');
    console.log('Try sending a message to yourself (or having a friend text you) to see the AI reply.');
});

// 4. Listen for Messages
client.on('message', async (message) => {
    try {
        // Prevent responding to groups unless specifically tagged or you want to (uncomment if you want groups)
        // const chat = await message.getChat();
        // if (chat.isGroup) return; 

        // We only respond to text messages for now
        if (message.body && typeof message.body === 'string') {
            console.log(`[Received] ${message.from}: ${message.body}`);

            // Show "typing..." indicator
            const chat = await message.getChat();
            chat.sendStateTyping();

            // Send to OpenRouter
            const aiResponse = await getAIResponse(message.body);

            // Reply to the user
            await message.reply(aiResponse);
            console.log(`[Sent] SwasthyaSaathi AI: ${aiResponse}`);
        }
    } catch (error) {
        console.error('Error processing message:', error);
        message.reply("Sorry, the AI is taking a quick break!");
    }
});

// Helper function to talk to OpenRouter completely exactly like Vercel backend
function getAIResponse(userMessage) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            model: "stepfun/step-3.5-flash:free",
            messages: [{ role: "user", content: userMessage }],
            stream: false
        });

        const options = {
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const orReq = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.choices[0]?.message?.content || "AI Assistant is currently unavailable.");
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`API Error: ${data}`));
                }
            });
        });

        orReq.on('error', reject);
        orReq.write(postData);
        orReq.end();
    });
}

// 5. Start the bot
client.initialize();
