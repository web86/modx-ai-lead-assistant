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

The gateway secret is server-side only. Never render it into a Chunk, template, JavaScript, or page source.

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
