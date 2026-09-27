import express from 'express';
import crypto from 'node:crypto';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb', type: 'application/json' }));

const GROQ_API_KEY = String(process.env.GROQ_API_KEY || '').trim();
const GATEWAY_SECRET = String(process.env.GATEWAY_SECRET || '').trim();
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '').trim();

if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
}

if (!GATEWAY_SECRET) {
    throw new Error('GATEWAY_SECRET is not configured');
}

function secureEqual(a, b) {
    const aBuffer = Buffer.from(String(a || ''));
    const bBuffer = Buffer.from(String(b || ''));

    if (aBuffer.length === 0 || aBuffer.length !== bBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function gatewayError(res, status, message, code) {
    return res.status(status).json({
        error: {
            message,
            type: 'gateway_error',
            code,
            param: null
        }
    });
}

function authenticateGateway(req, res) {
    const suppliedSecret = req.get('x-gateway-secret') || '';

    if (!secureEqual(suppliedSecret, GATEWAY_SECRET)) {
        gatewayError(
            res,
            401,
            'Invalid gateway credentials',
            'invalid_gateway_secret'
        );
        return false;
    }

    return true;
}

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        service: 'modx-ai-lead-assistant-gateway'
    });
});

app.post('/chat', async (req, res) => {
    if (!authenticateGateway(req, res)) {
        return;
    }

    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return gatewayError(res, 400, 'Invalid request body', 'invalid_body');
    }

    const model = typeof body.model === 'string' ? body.model.trim() : '';
    const instructions = typeof body.instructions === 'string'
        ? body.instructions
        : '';
    const input = Array.isArray(body.input) ? body.input : null;
    const textConfig = body.text && typeof body.text === 'object' && !Array.isArray(body.text)
        ? body.text
        : null;

    let maxOutputTokens = Number(body.max_output_tokens || 400);

    if (!model || model.length > 100) {
        return gatewayError(res, 400, 'Invalid model', 'invalid_model');
    }

    if (instructions.length > 30000) {
        return gatewayError(
            res,
            400,
            'Instructions are too large',
            'instructions_too_large'
        );
    }

    if (!input || input.length === 0 || input.length > 50) {
        return gatewayError(res, 400, 'Invalid conversation input', 'invalid_input');
    }

    if (JSON.stringify(input).length > 100000) {
        return gatewayError(res, 413, 'Conversation is too large', 'input_too_large');
    }

    if (!Number.isFinite(maxOutputTokens)) {
        maxOutputTokens = 400;
    }

    maxOutputTokens = Math.max(50, Math.min(Math.round(maxOutputTokens), 1000));

    const groqPayload = {
        model,
        store: false,
        reasoning: {
            effort: 'low'
        },
        instructions,
        input,
        max_output_tokens: maxOutputTokens
    };

    if (textConfig) {
        const textConfigSize = JSON.stringify(textConfig).length;

        if (textConfigSize > 20000) {
            return gatewayError(
                res,
                400,
                'Text configuration is too large',
                'text_config_too_large'
            );
        }

        groqPayload.text = textConfig;
    }

    try {
        const groqResponse = await fetch(
            'https://api.groq.com/openai/v1/responses',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify(groqPayload),
                signal: AbortSignal.timeout(35000)
            }
        );

        const responseText = await groqResponse.text();

        res.status(groqResponse.status);
        res.set('Content-Type', 'application/json; charset=utf-8');
        return res.send(responseText);
    } catch (error) {
        console.error('Groq request failed:', error);

        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
            return gatewayError(res, 504, 'Groq request timed out', 'groq_timeout');
        }

        return gatewayError(
            res,
            502,
            'Could not connect to Groq',
            'groq_connection_failed'
        );
    }
});

app.post('/telegram', async (req, res) => {
    if (!authenticateGateway(req, res)) {
        return;
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return gatewayError(
            res,
            500,
            'Telegram is not configured',
            'telegram_not_configured'
        );
    }

    const body = req.body || {};

    const name = String(body.name || '').trim().slice(0, 100);
    const email = String(body.email || '').trim().slice(0, 254);
    const website = String(body.website || '').trim().slice(0, 400);
    const request = String(body.request || '').trim().slice(0, 600);
    const summary = String(body.summary || '').trim().slice(0, 1600);
    const pageUrl = String(body.page_url || '').trim().slice(0, 500);

    if (!email) {
        return gatewayError(res, 400, 'Email is required', 'missing_email');
    }

    let text = '🚀 New Portfolio Lead\n\n';
    text += `👤 Name: ${name || '—'}\n`;
    text += `📧 Email: ${email}\n`;
    text += `🌐 Website: ${website || '—'}\n\n`;
    text += `📋 Request\n${request || '—'}\n\n`;
    text += `🤖 AI Summary\n${summary || '—'}`;

    if (pageUrl) {
        text += `\n\n🔗 Source page\n${pageUrl}`;
    }

    if (text.length > 3800) {
        text = `${text.slice(0, 3790)}\n…`;
    }

    try {
        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text,
                    link_preview_options: {
                        is_disabled: true
                    }
                }),
                signal: AbortSignal.timeout(10000)
            }
        );

        const telegramData = await telegramResponse.json();

        if (!telegramResponse.ok || telegramData.ok !== true) {
            console.error('Telegram API error:', telegramData);
            return gatewayError(
                res,
                502,
                telegramData.description || 'Telegram request failed',
                'telegram_request_failed'
            );
        }

        return res.json({
            ok: true,
            message_id: telegramData.result?.message_id ?? null
        });
    } catch (error) {
        console.error('Telegram connection failed:', error);
        return gatewayError(
            res,
            502,
            'Could not connect to Telegram',
            'telegram_connection_failed'
        );
    }
});

app.use((req, res) => {
    gatewayError(res, 404, 'Not found', 'not_found');
});

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400) {
        return gatewayError(res, 400, 'Invalid JSON', 'invalid_json');
    }

    console.error(err);
    return gatewayError(res, 500, 'Internal gateway error', 'gateway_internal_error');
});

const port = Number(process.env.PORT || 8080);

app.listen(port, '0.0.0.0', () => {
    console.log(`MODX AI Lead Assistant gateway listening on ${port}`);
});
