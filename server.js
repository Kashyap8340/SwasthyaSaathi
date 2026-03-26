// server.js
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import https from 'https';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files from the same directory
app.use(express.static(__dirname));

// Chat Endpoint with Streaming Support
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;

        // Verify messages exist
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Valid messages array is required' });
        }

        // Set headers for SSE (Server-Sent Events) streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Prevent Vercel/Nginx from buffering the stream

        const postData = JSON.stringify({
            model: "stepfun/step-3.5-flash:free",
            messages: messages,
            stream: true
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

        const orReq = https.request(options, (orRes) => {
            if (orRes.statusCode !== 200) {
                let errBody = '';
                orRes.on('data', chunk => errBody += chunk);
                orRes.on('end', () => {
                    console.error("OpenRouter API error body:", errBody);
                    let errorMessage = "AI Assistant is currently unavailable.";
                    try {
                        const parsedError = JSON.parse(errBody);
                        errorMessage = parsedError.error?.message || errorMessage;
                    } catch (e) { }

                    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
                    res.write('data: [DONE]\n\n');
                    res.end();
                });
                return;
            }

            orRes.on('data', (chunk) => {
                const chunkStr = chunk.toString('utf-8');
                const lines = chunkStr.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            const content = parsed.choices[0]?.delta?.content;
                            if (content) {
                                res.write(`data: ${JSON.stringify({ content })}\n\n`);
                            }
                        } catch (e) {
                            // ignore parse errors for partial chunks
                        }
                    }
                }
            });

            orRes.on('end', () => {
                res.write('data: [DONE]\n\n');
                res.end();
            });
        });

        orReq.on('error', (error) => {
            console.error('Error proxying to OpenRouter:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal Server Error' });
            } else {
                res.end();
            }
        });

        orReq.write(postData);
        orReq.end();

    } catch (error) {
        console.error('Error proxying to OpenRouter:', error);

        // If headers are not sent, return standard JSON error
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            // Otherwise end the stream
            res.end();
        }
    }
});

// WhatsApp Endpoint Configured for Twilio
app.post('/api/whatsapp', async (req, res) => {
    try {
        const incomingMsg = req.body.Body;
        if (!incomingMsg) {
            return res.status(400).send('No message body');
        }

        const postData = JSON.stringify({
            model: "stepfun/step-3.5-flash:free",
            messages: [{ role: "user", content: incomingMsg }],
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

        let responseText = "AI Assistant is currently unavailable.";

        const orReq = https.request(options, (orRes) => {
            let data = '';
            orRes.on('data', chunk => data += chunk);
            orRes.on('end', () => {
                if (orRes.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(data);
                        responseText = parsed.choices[0]?.message?.content || responseText;
                    } catch (e) {
                        console.error("Error parsing OpenRouter response", e);
                    }
                } else {
                    console.error("OpenRouter API error:", data);
                }

                // Send Twilio XML Response
                res.setHeader('Content-Type', 'text/xml');
                res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${responseText}</Message></Response>`);
            });
        });

        orReq.on('error', (error) => {
            console.error('Error proxying to OpenRouter:', error);
            res.setHeader('Content-Type', 'text/xml');
            res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error connecting to AI service.</Message></Response>`);
        });

        orReq.write(postData);
        orReq.end();

    } catch (error) {
        console.error('WhatsApp Endpoint Error:', error);
        res.setHeader('Content-Type', 'text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Internal Server Error.</Message></Response>`);
    }
});

// Export app for Vercel
export default app;

if (process.env.NODE_ENV !== 'production' && import.meta.url === `file://${process.argv[1]}`) {
    app.listen(PORT, () => {
        console.log(`Server is running successfully on http://localhost:${PORT}`);
    });
}
