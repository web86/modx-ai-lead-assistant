# MODX 2 adapter

This folder contains the MODX 2 adapter for the shared AI Lead Assistant frontend and Cloud Run gateway.

## Install

Copy:

```text
modx/chat.php
```

to:

```text
/assets/components/assistant/api/chat.php
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

```html
<div
    class="fw-assistant"
    id="fwAssistant"
    data-endpoint="/assets/components/assistant/api/chat.php"
>
```

## Email

The MODX 2 adapter uses the legacy MODX mail service:

```php
$mail = $modx->getService('mail', 'mail.modPHPMailer');
```

Configure MODX mail / SMTP System Settings before testing.


## Lead logging

Lead logging is enabled by default. The default directory is:

```text
MODX_CORE_PATH/logs/ai-lead-assistant
```

Optional System Settings:

| Setting | Default |
| --- | --- |
| `portfolio_assistant.log_enabled` | `1` |
| `portfolio_assistant.log_path` | `{core_path}logs/ai-lead-assistant` |

Logs are stored as monthly JSONL files such as:

```text
2026-10-AILeadLogs.jsonl
```

Events:

- `contact_saved` — email was entered;
- `first_request` — the first visitor request was received;
- `handoff_success` — email and/or Telegram delivery succeeded;
- `handoff_failed` — a handoff was attempted but neither channel succeeded.

### Lead viewer

Copy:

```text
modx/admin/index.php
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
