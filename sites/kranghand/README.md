# Kranghand Design — direct Groq + Telegram (MODX 2)

This site-specific example reuses the existing MODX 2 adapter, frontend, lead journal, and manager viewer. **No Cloud Run or Deno gateway is required.** Existing deployments remain in `gateway` mode by default.

## 1. Files

Install `modx/chat.php` as `/assets/components/assistant/api/chat.php`, copy `modx/admin/index.php` to `/assets/components/assistant/admin/index.php`, and the shared frontend CSS/JS as documented in the repository root README.

Use the HTML from `frontend/assistant.html`. **Before** its final `assistant.js` script tag add:

```html
<script src="/assets/components/assistant/js/kranghand-localize.js" defer></script>
```

Place `sites/kranghand/localize.js` at that URL. It reads the HTML `lang` attribute: `en`, `nl`, or `ru`. Load the widget once in the common footer, not in three different templates.

## 2. MODX System Settings

| Setting | Value |
| --- | --- |
| `portfolio_assistant.enabled` | `1` (turn on after tests) |
| `portfolio_assistant.transport` | `direct` |
| `portfolio_assistant.owner_name` | `Nadia Kranghand` |
| `portfolio_assistant.model` | `openai/gpt-oss-120b` |
| `portfolio_assistant.email_to` | The verified inbox Nadia wants for leads |
| `portfolio_assistant.max_messages` | `10` |
| `portfolio_assistant.telegram_enabled` | `1`, after credentials and chat ID are tested |
| `portfolio_assistant.ai_rules` | `portfolio_assistant.ai_rules` |

Create Chunk `portfolio_assistant.ai_rules` and paste `sites/kranghand/ai_rules.txt` as plain text. This Chunk is read raw, without executing MODX placeholders.

### Secrets (best: host environment, never Git or browser)

```text
PORTFOLIO_ASSISTANT_GROQ_API_KEY
PORTFOLIO_ASSISTANT_TELEGRAM_BOT_TOKEN
PORTFOLIO_ASSISTANT_TELEGRAM_CHAT_ID
```

If this shared hosting cannot configure PHP process environment values, the MODX 2 adapter also reads the server-side System Settings `portfolio_assistant.groq_api_key`, `portfolio_assistant.telegram_bot_token`, `portfolio_assistant.telegram_chat_id`. Treat the MODX Manager and backups as sensitive. Do not copy these secrets into templates, frontend markup, chunks, logs, or the repository.

**Not required in direct mode:** `portfolio_assistant.gateway_url`, `portfolio_assistant.gateway_secret`, `portfolio_assistant.telegram_gateway_url`.

## 3. Direct requests

Groq: `POST https://api.groq.com/openai/v1/responses`; PHP sends `Authorization: Bearer <GROQ_API_KEY>` plus the existing structured Responses payload.

Telegram: `POST https://api.telegram.org/bot<TOKEN>/sendMessage`; PHP sends `chat_id` and a short plain-text lead summary. Email is sent using MODX SMTP separately; successful delivery to either channel completes the handoff.

**Important:** The existing widget requires an email before starting the chat. Lead logs may retain visitor email and message text in `MODX_CORE_PATH/cache/logs/ai-lead-assistant`; update the privacy statement and retention policy, and verify the directory is outside public web access.

## 4. Go-live tests

1. Confirm PHP cURL, HTTPS to Groq and Telegram, MODX SMTP and `MODX_CORE_PATH` log directory permissions.
2. Keep `portfolio_assistant.enabled=0` until configuration is complete.
3. Enable temporarily on a staging page and test EN, NL, RU, including a user switching languages.
4. Test normal FAQ, an ambiguous request, a valid lead, and a simulated email error with Telegram success (and vice versa).
5. Confirm Telegram arrival, email Reply-To, journal statuses, and manager viewer access.
6. Confirm the chat opens, closes, respects mobile layout and does not override the site's consent/CMP behavior.
7. Turn on globally only after successful tests.

## Notes

- The direct transport is an *opt-in* mode and does not change existing `gateway` installations.
- The code is prepared in GitHub only. Deployment to kranghanddesign.com, credentials, production network access, and live end-to-end tests must be completed separately.
- For production abuse resistance use server-wide throttling, quotas and anomaly monitoring; session-based throttling alone is not enough against distributed requests.
