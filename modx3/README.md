# MODX 3 adapter

This folder contains the MODX 3 adapter for the shared AI Lead Assistant frontend and Cloud Run gateway.

The Cloud Run service does **not** need to be changed.

## Install

Copy:

```text
modx3/chat.php
```

to:

```text
/assets/components/assistant/api/chat.php
```

The adapter assumes that path so it can find the MODX installation root with:

```php
$rootPath = dirname(__DIR__, 4);
```

## MODX 3 bootstrap

Unlike the MODX 2 adapter, the MODX 3 version uses the Composer autoloader and namespaced MODX classes:

```php
use MODX\Revolution\modX;

require_once $rootPath . '/config.core.php';
require_once MODX_CORE_PATH . 'vendor/autoload.php';

$modx = new modX();
$modx->initialize('web');
```

## System Settings

Create these MODX System Settings:

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
| `portfolio_assistant.ai_rules` | `portfolio_assistant.ai_rules` (Chunk name) |

The gateway secret is server-side only. Never render it into a Chunk, template, JavaScript, or page source.

## AI rules Chunk

Create a MODX Chunk with this exact name:

```text
portfolio_assistant.ai_rules
```

Paste the contents of:

```text
shared/portfolio_assistant.ai_rules.txt
```

into the Chunk.

The adapter reads the raw Chunk `snippet` field, so the rules are not rendered through the MODX parser before they are sent to the AI.

Use this Chunk for business-specific instructions such as services, tone, languages, qualification questions, pricing policy, and other assistant behavior.

Security rules, prompt-injection resistance, accuracy constraints, and the handoff contract remain protected in `chat.php` and override the editable Chunk when necessary.

If the Chunk is missing or empty, the adapter falls back to a minimal safe business prompt and writes a warning to the MODX error log.

The Chunk content is limited to 12,000 characters when loaded.

## Frontend endpoint

Use the shared frontend from `../frontend/` with:

```html
<div
    class="fw-assistant"
    id="fwAssistant"
    data-endpoint="/assets/components/assistant/api/chat.php"
>
```

## Email

The MODX 3 adapter uses the namespaced mail classes directly:

```php
use MODX\Revolution\Mail\modMail;
use MODX\Revolution\Mail\modPHPMailer;

$mail = new modPHPMailer($modx);
```

This avoids relying on the deprecated `getService()` pattern for creating the mail service.

Configure the normal MODX 3 mail / SMTP System Settings before testing. The visitor email is used as `Reply-To`.

## Conversation state

The MODX 3 adapter currently uses a PHP session for:

- conversation history;
- per-session rate limiting;
- handoff state.

The current visitor message is only committed to history after a successful AI response, which prevents duplicated history when a request fails and the visitor retries.

## Telegram

Telegram uses the same Cloud Run endpoint as the other adapters:

```text
MODX 3
  ↓
Cloud Run /telegram
  ↓
Telegram Bot API
```

The Telegram bot token stays in Google Secret Manager and is never stored in MODX.

## Shared architecture

```text
MODX 2 ─┐
MODX 3 ─┼─> Cloud Run ─> Groq
WP     ─┘        └─────> Telegram
```


## Lead logging

Lead logging is enabled by default. The default directory is:

```text
MODX_CORE_PATH/cache/logs/ai-lead-assistant
```

Optional System Settings:

| Setting | Default |
| --- | --- |
| `portfolio_assistant.log_enabled` | `1` |
| `portfolio_assistant.log_path` | `{core_path}cache/logs/ai-lead-assistant` |

Logs are stored as monthly JSONL files such as:

```text
2026-10-AILeadLogs.jsonl
```

Events:

- `contact_saved`;
- `first_request`;
- `handoff_success`;
- `handoff_failed`.

### Lead viewer

Copy:

```text
modx3/admin/index.php
```

to:

```text
/assets/components/assistant/admin/index.php
```

Then open:

```text
/assets/components/assistant/admin/
```

The viewer requires an active MODX Manager session and a sudo user. It provides filters and CSV export.
