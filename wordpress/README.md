# WordPress adapter

This folder contains a WordPress-native adapter for the same Cloud Run gateway used by the MODX example.

The Cloud Run service does **not** need to be changed.

## Install

1. Create a folder:

```text
wp-content/plugins/web86-ai-lead-assistant/
```

2. Copy `web86-ai-lead-assistant.php` into it.
3. Activate **Web86 AI Lead Assistant** in WordPress.
4. Open **Settings → AI Lead Assistant**.
5. Configure the same Cloud Run URLs and gateway secret used by the MODX installation.

For production, keep the gateway secret in `wp-config.php` instead of the database:

```php
define('WEB86_AI_GATEWAY_SECRET', 'your-long-random-secret');
```

## REST endpoint

The plugin registers:

```text
POST /wp-json/web86-ai-lead/v1/chat
```

The route is public because website visitors are not logged in. The adapter still performs:

- same-origin checking;
- email validation;
- message-size validation;
- per-IP rate limiting;
- unguessable conversation IDs;
- bounded conversation history;
- server-side gateway authentication.

WordPress requires a `permission_callback` when registering REST routes. Since this is intentionally a public visitor endpoint, the plugin uses `__return_true` and performs its own validation inside the callback.

## Conversation storage

Unlike the MODX adapter, the WordPress version does not start a PHP session.

The browser sends an unguessable `conversation_id`, and WordPress stores conversation state in a transient for up to 12 hours.

The shared frontend JavaScript generates this ID automatically.

## Frontend endpoint

Use the same frontend widget from `../frontend/`, but change the root element to:

```html
<div
    class="fw-assistant"
    id="fwAssistant"
    data-endpoint="/wp-json/web86-ai-lead/v1/chat"
>
```

The same JavaScript can now work with both MODX and WordPress.

## Email

WordPress lead email is sent with `wp_mail()`. Configure your normal WordPress SMTP/mail plugin as usual.

A successful `wp_mail()` result means WordPress handed the message to its configured mail transport without an immediate error; it is not a delivery receipt.

## Telegram

Telegram continues to use:

```text
WordPress
  ↓
Cloud Run /telegram
  ↓
Telegram Bot API
```

The Telegram bot token remains in Google Secret Manager and is never stored in WordPress.


## AI rules

Version 1.1.0 adds a configurable **AI rules** textarea under:

```text
Settings → AI Lead Assistant
```

Use this field for business-specific behavior such as:

- services and technologies;
- tone and response length;
- languages;
- qualification questions;
- pricing policy;
- deadlines and estimation policy;
- what the assistant should and should not ask.

The plugin combines the editable rules with a protected system layer.

Editable rules:

```text
CUSTOM ASSISTANT RULES
```

Protected rules:

```text
SYSTEM SAFETY AND HANDOFF CONTRACT
```

The protected layer remains in PHP and takes precedence if there is a conflict. It covers prompt-injection resistance, secret protection, accuracy constraints, structured lead handoff, and the rule that the assistant must not claim a request was delivered before email or Telegram actually succeeds.

Existing installations automatically receive the previous business rules as defaults until the settings are saved.

The field is limited to 12,000 characters.
