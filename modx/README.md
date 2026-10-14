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

## Conversation lifecycle and recovery

MODX 2 identifies a conversation by both `conversation_id` and email inside the
existing PHP session. It retains independent conversations until that session
expires, so an old tab or a retried delivered request cannot inherit another
conversation or send its notifications again. The previous single conversation
is migrated lazily, preserving its history and delivery flags. The PHP session
lock remains held through handoff; the existing session handler and cookie
settings are unchanged.

With logging enabled, a failed `contact_saved` write returns HTTP 503 and
`ok: false`. Message requests also require a saved contact and first-request
journal entry before calling AI. The widget keeps the email field populated,
displays a generic error, and allows Continue to retry with the same ID. It stores
the confirmed `fwAssistantEmail` only after a successful contact response.
`portfolio_assistant.log_enabled=0` intentionally permits operation without the
journal.

On refresh, active contacts are rechecked idempotently before the chat resumes.
The widget preserves its ID and up to 50 visible messages in `sessionStorage`.
After confirmed delivery, it keeps the composer disabled across refreshes and
offers **Start a new conversation**. This clears only that tab's assistant state,
prefills the previous email, and assigns a fresh ID when Continue is pressed.
The successful handoff flag now stores its conversation ID; old `1` flags are
migrated without sending any requests automatically.

If both notification channels fail, the server returns an explicit failure
message and leaves handoff retryable. If either succeeds, delivery is marked
before diagnostic JSONL logging. Replays return the original delivery channels
without sending notifications or calling AI. This protection lasts for the PHP
session; the journal is not a durable delivery deduplication database.

Optional frontend translations (on `#fwAssistant`):

- `data-text-contact-error`: contact failure and Continue retry instruction.
- `data-text-new-chat`: the completed-chat action label.

### Updating an existing MODX 2 installation

1. Back up the installed assistant files. Leave the existing log directory,
   monthly JSONL files, PHP session storage, settings, and Lead Viewer intact.
2. Replace `/assets/components/assistant/api/chat.php` with `modx/chat.php`.
3. Replace the site's shared assistant JavaScript and CSS with
   `frontend/assistant.js` and `frontend/assistant.css`. Keep the existing HTML
   and translations; no markup change is required.
4. Refresh the static asset version/cache so visitors receive the matching JS
   and CSS. Do not clear PHP sessions or delete lead logs.
5. In a test session, complete two conversations with the same email using
   **Start a new conversation**. Confirm separate IDs/events in Lead Viewer and
   delivery via your configured channels. Also verify contact retry when the
   test log directory is temporarily unavailable.

No Cloud Run, database, JSONL schema, or Lead Viewer migration is needed. Install
the PHP fix before enabling the new shared frontend action on MODX 2. Rolling
back to the old PHP loses access to the new per-conversation session map and can
reintroduce duplicate delivery; keep the fixed adapter once visitors use it.

See [regression coverage and verification limits](../tests/README.md) and the
[fix report](../docs/modx2-conversation-lifecycle.md).
