# AI Lead Assistant for MODX 2, MODX 3, and WordPress

A lightweight AI lead-assistant widget with adapters for MODX 2, MODX 3, and WordPress. Visitors can start a conversation, describe a project, answer a few clarifying questions, and hand the request off to the site owner. The owner receives the lead by email and optionally in Telegram.

The example uses:

- Vanilla HTML/CSS/JavaScript for the chat widget
- MODX 2, MODX 3, or WordPress as the CMS-side adapter for validation, conversation state, lead handoff, and email
- Google Cloud Run as a small outbound API gateway
- Groq Responses API with `openai/gpt-oss-120b`
- Telegram Bot API for instant lead notifications

## Architecture

```text
Visitor
  |
  v
Vanilla JS chat widget
  |
  +-----------+-----------+
  |           |           |
  v           v           v
MODX 2      MODX 3     WordPress
chat.php    chat.php    REST adapter
  |           |           |
  +-----------+-----------+
              |
              +----> CMS mail -> Email
              |
              v
Google Cloud Run
  |\
  | \--> Telegram Bot API
  |
  v
Groq Responses API
  |
  v
openai/gpt-oss-120b
```

The browser never receives Groq, Telegram, or gateway secrets.

## Repository structure

```text
frontend/
  assistant.html
  assistant.css
  assistant.js
modx/
  chat.php
  README.md
modx3/
  chat.php
  README.md
shared/
  portfolio_assistant.ai_rules.txt
wordpress/
  web86-ai-lead-assistant.php
  README.md
cloud-run/
  index.js
  package.json
  .env.example
```

## 1. Frontend

Copy the files from `frontend/` into your site and include the CSS and JavaScript. The root element contains the server endpoint:

```html
<div
    class="fw-assistant"
    id="fwAssistant"
    data-endpoint="/assets/components/assistant/api/chat.php"
>
```

The widget validates the visitor email before starting the conversation, keeps it only in `sessionStorage`, supports Enter/Shift+Enter, and disables the composer after a successful handoff.

## 2. MODX 2 settings

Create these System Settings:

| Setting | Example |
| --- | --- |
| `portfolio_assistant.enabled` | `1` |
| `portfolio_assistant.owner_name` | `Konstantin` |
| `portfolio_assistant.model` | `openai/gpt-oss-120b` |
| `portfolio_assistant.email_to` | `you@example.com` |
| `portfolio_assistant.max_messages` | `10` |
| `portfolio_assistant.gateway_url` | `https://YOUR-SERVICE.run.app/chat` |
| `portfolio_assistant.gateway_secret` | long random secret |
| `portfolio_assistant.telegram_enabled` | `1` |
| `portfolio_assistant.telegram_gateway_url` | `https://YOUR-SERVICE.run.app/telegram` |

`portfolio_assistant.gateway_secret` is server-side only. Never render it into a template or JavaScript.

Copy `modx/chat.php` to:

```text
/assets/components/assistant/api/chat.php
```

The example assumes that location when bootstrapping MODX.

### Editable AI rules in MODX

Both MODX 2 and MODX 3 read business-specific AI instructions from a Chunk named:

```text
portfolio_assistant.ai_rules
```

A ready-to-paste template is included at:

```text
shared/portfolio_assistant.ai_rules.txt
```

The adapters read the raw Chunk content instead of rendering it, so MODX tags inside the text are not processed. Security, accuracy, and handoff rules remain protected in PHP.


## MODX 3 adapter

The same frontend and Cloud Run deployment can also be used with MODX 3.

Copy:

```text
modx3/chat.php
```

to:

```text
/assets/components/assistant/api/chat.php
```

MODX 3 uses the same System Settings as MODX 2:

```text
portfolio_assistant.enabled
portfolio_assistant.owner_name
portfolio_assistant.model
portfolio_assistant.email_to
portfolio_assistant.max_messages
portfolio_assistant.gateway_url
portfolio_assistant.gateway_secret
portfolio_assistant.telegram_enabled
portfolio_assistant.telegram_gateway_url
```

The MODX 3 adapter differs mainly in bootstrap and mail integration:

```php
use MODX\Revolution\modX;
use MODX\Revolution\Mail\modMail;
use MODX\Revolution\Mail\modPHPMailer;

require_once $rootPath . '/config.core.php';
require_once MODX_CORE_PATH . 'vendor/autoload.php';

$modx = new modX();
$modx->initialize('web');

$mail = new modPHPMailer($modx);
```

This uses MODX 3's Composer autoloader and namespaced mail classes instead of the legacy MODX 2 service-loading pattern.

The frontend endpoint remains:

```html
<div
    class="fw-assistant"
    id="fwAssistant"
    data-endpoint="/assets/components/assistant/api/chat.php"
>
```

See `modx3/README.md` for the full setup.


## WordPress adapter

The same Cloud Run deployment can also be used by WordPress without changing `cloud-run/index.js`.

Install the plugin from:

```text
wordpress/web86-ai-lead-assistant.php
```

into:

```text
wp-content/plugins/web86-ai-lead-assistant/web86-ai-lead-assistant.php
```

Activate it, then open:

```text
Settings → AI Lead Assistant
```

Configure the same Cloud Run `/chat` and `/telegram` URLs and the same gateway secret.

For production, prefer keeping the gateway secret outside the database:

```php
define('WEB86_AI_GATEWAY_SECRET', 'your-long-random-secret');
```

The WordPress plugin exposes:

```text
POST /wp-json/web86-ai-lead/v1/chat
```

Use that value as the frontend `data-endpoint`:

```html
<div
    class="fw-assistant"
    id="fwAssistant"
    data-endpoint="/wp-json/web86-ai-lead/v1/chat"
>
```

The frontend now sends a random `conversation_id` for both CMS adapters. MODX may continue using PHP session state, while WordPress stores its conversation state in Transients.

WordPress lead email is sent with `wp_mail()`; Telegram continues through the same Cloud Run `/telegram` endpoint, so the Telegram bot token stays in Google Secret Manager.

See `wordpress/README.md` for the full setup.

## 3. MODX email

The MODX 2 adapter uses the legacy MODX mail service:

```php
$mail = $modx->getService('mail', 'mail.modPHPMailer');
```

Configure MODX email/SMTP normally before testing. The visitor email is used as `Reply-To`.

## 4. Cloud Run gateway

The gateway exposes:

```text
GET  /health
POST /chat
POST /telegram
```

`/chat` and `/telegram` require:

```http
X-Gateway-Secret: YOUR_SECRET
```

Install:

```bash
cd cloud-run
npm install
```

Required environment variables:

```text
GROQ_API_KEY
GATEWAY_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Prefer Google Secret Manager for API keys.

### Example Secret Manager setup

```bash
read -s GROQ_API_KEY
printf '%s' "$GROQ_API_KEY" | \
  gcloud secrets create portfolio-groq-key --data-file=-

read -s GATEWAY_SECRET
printf '%s' "$GATEWAY_SECRET" | \
  gcloud secrets create portfolio-gateway-secret --data-file=-

read -s TELEGRAM_BOT_TOKEN
printf '%s' "$TELEGRAM_BOT_TOKEN" | \
  gcloud secrets create portfolio-telegram-bot-token --data-file=-
```

Grant the Cloud Run service account `roles/secretmanager.secretAccessor` for each secret.

### Deploy

```bash
gcloud run deploy portfolio-assistant-gateway \
  --source . \
  --region=europe-west1 \
  --allow-unauthenticated \
  --service-account="YOUR_SERVICE_ACCOUNT" \
  --set-secrets="GROQ_API_KEY=portfolio-groq-key:1,GATEWAY_SECRET=portfolio-gateway-secret:1,TELEGRAM_BOT_TOKEN=portfolio-telegram-bot-token:1" \
  --set-env-vars="TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID" \
  --memory=256Mi \
  --cpu=1 \
  --min=0 \
  --max=3 \
  --timeout=45s
```

## 5. Test the gateway

Health:

```bash
curl "$GATEWAY_URL/health"
```

Groq:

```bash
curl -sS \
  -X POST \
  "$GATEWAY_URL/chat" \
  -H "Content-Type: application/json" \
  -H "X-Gateway-Secret: $GATEWAY_SECRET" \
  -d '{
    "model": "openai/gpt-oss-120b",
    "instructions": "Reply briefly in English.",
    "input": [{"role":"user","content":"Hello. Who are you?"}],
    "max_output_tokens": 200
  }'
```

Telegram:

```bash
curl -sS \
  -X POST \
  "$GATEWAY_URL/telegram" \
  -H "Content-Type: application/json" \
  -H "X-Gateway-Secret: $GATEWAY_SECRET" \
  -d '{
    "name": "John",
    "email": "john@example.com",
    "website": "example.com",
    "request": "Build a WordPress website",
    "summary": "The client needs a small WordPress website.",
    "page_url": "https://example.com/"
  }'
```

## 6. Lead handoff

The model returns structured JSON:

```json
{
  "reply": "...",
  "ready_to_handoff": false,
  "handoff_message": "",
  "lead": {
    "name": null,
    "website": null,
    "request": "...",
    "summary": "..."
  }
}
```

The model may decide that a lead is ready, but it is not allowed to claim that delivery already happened. The server performs the real delivery. Only after email or Telegram succeeds does the visitor receive the final handoff message.

## 7. Reliability details

- The current visitor message is committed to PHP session history only after the request completes successfully, preventing duplicate history after retries.
- The visitor email is injected into server-controlled AI instructions so the model does not ask for it again.
- Conversation history is bounded with `portfolio_assistant.max_messages`.
- User messages are rendered with `textContent`, not `innerHTML`.
- Groq and Telegram credentials remain in Cloud Run / Secret Manager.
- Email and Telegram are independent channels; if either succeeds, the lead is considered delivered.

## 8. Security notes

This is an educational MVP. For heavier production traffic consider durable rate limiting, abuse challenges, persistent lead storage, stronger observability, automated secret rotation, and IAM-authenticated Cloud Run calls when your hosting environment supports them.

Never commit real API keys, Telegram bot tokens, gateway secrets, visitor data, or production configuration.

## License

MIT.


## Lead logging and recovery

All three CMS adapters can keep a small persistent lead journal so a contact is not lost when a visitor leaves before the final handoff.

The lifecycle is stored as append-only JSONL events:

```text
contact_saved
first_request
handoff_success
handoff_failed
```

Files are split by month:

```text
2026-10-AILeadLogs.jsonl
2026-11-AILeadLogs.jsonl
```

Each conversation is correlated by `conversation_id`. The viewer combines the events into one lead row with one of these states:

```text
Contact only
Conversation started
Handoff failed
Sent
```

Only the data needed to recover the lead is stored: email, source page, first request, and — when handoff is attempted — the same compact lead fields used for Telegram (`name`, `website`, `request`, `summary`) plus delivery-channel results. IP addresses and User-Agent strings are not stored.

The viewers support period/status/contact/request filtering and CSV export.
