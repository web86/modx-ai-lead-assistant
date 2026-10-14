# MODX 2 conversation lifecycle and contact logging fix

Verified on 2026-10-14. Baseline: `750d8a4`.

## Confirmed causes and reproduction

1. The original MODX 2 session reset compared only email. With one persistent
   cookie, the second conversation ID using the same email inherited
   `contact_logged_at`, `first_request_logged_at`, `history`, and `handoff_sent_at`.
   The regression expecting three independent handoffs failed at the second
   delivery. Independent IDs now select independent state within the same session.
2. `action=contact` always returned `ok: true` after a failed journal write. The
   baseline returned HTTP 200 for a log path whose parent was a regular file and
   for an unwritable directory. JSONL write failure also returned false success.
3. The original browser stored email before `saveContact()` and continued after
   catching its exception. A Chromium probe against the baseline JS, with a
   mocked HTTP 503 contact response, still reached `is-chatting` and persisted
   `visitor@example.test` in `fwAssistantEmail`.
4. The browser reused an existing ID on email submission, stored handoff as an
   unscoped `1`, and offered no new-conversation action after completion. It also
   discarded the visible transcript on refresh despite server history surviving.
5. An already delivered MODX 2 conversation suppressed notifications but returned
   `handoff_sent: false` on a subsequent message and called AI again. Both-channel
   failure returned an ordinary AI reply, with no explicit delivery failure.
   Completion now returns its original confirmation/channels without outbound work.

The baseline server suite had 5 passing and 8 failing scenarios before fixes.
These reproductions establish code-level causes consistent with the reported
ordinary/private-browser difference. They do not prove which session or storage
state existed during the original production incident.

## Changes

- `modx/chat.php`: session identity uses ID + email, lazily migrates legacy state,
  retains previous conversations for replay protection, blocks unconfirmed contact
  and first-request writes, handles intentionally disabled logging, returns stable
  completed delivery results, marks delivery before diagnostic logging, reports
  both-channel failure explicitly, and logs concise failure diagnostics without
  upstream bodies, secrets, or visitor message contents.
- `frontend/assistant.js`: reserves one ID across contact retries, stores email
  only after confirmation, preserves pending email and visible history across
  refreshes, scopes completion to its ID, migrates old completion flags, and offers
  a fresh conversation after delivery with the previous email prefilled.
- `frontend/assistant.css`: styles the single necessary new-conversation action.
- `.gitignore`, `package.json`, `package-lock.json`: reproducible test commands and
  test-only Playwright dependency; generated dependencies/results are ignored.
- `tests/server.mjs`, `tests/browser.mjs`, `tests/fixtures/modx.php`,
  `tests/fixtures/gateway.php`, `tests/fixtures/session.php`, `tests/README.md`:
  regression coverage and safe local runtime fixtures.
- `README.md`, `modx/README.md`, this report: behavior, upgrade steps, and limits.

No changes to MODX 3 / WordPress server adapters, Cloud Run, Lead Viewer, settings,
existing log files, or JSONL event structure. No deployment or merge to main.

## Verification

| Status | Check | Result |
| --- | --- | --- |
| PASS | Isolated PHP HTTP regressions | 17/17 scenarios |
| PASS | Isolated HTTP widget integration | Contact retry + refresh + 3 same-email independent handoffs |
| PASS | Real MODX 2.8.8 / PHP 8.2.34 runtime regressions | 17/17 scenarios |
| PASS | Real MODX 2 HTTP Chromium widget integration | Separate logs and three Email/Telegram mock calls in one session |
| PASS | Shared frontend Chromium tests | 21/21 across MODX 2, MODX 3, and WordPress endpoint formats |
| PASS | PHP / JavaScript syntax and diff checks | Modified adapter, fixtures, widget, tests |
| NOT RUN | Firefox browser tests | Playwright Firefox runtime unavailable locally |
| NOT RUN | Real external Email / Telegram / AI services | Intentionally mocked; no real notifications sent |
| NOT RUN | Full MODX 3 / WordPress runtime integration | Shared frontend wire contract tested with mocks; adapters unchanged |
| NOT RUN | Multi-worker production load / session expiry recovery | Session-scoped deduplication retained; no durable delivery database introduced |

Real MODX testing used read-only mounts of an existing local acceptance CMS,
in-memory rule/settings overrides, temporary file sessions and lead logs, the real
MODX logging API, and recording delivery mocks. Atomic fixture configuration
writes and a 1.1-second synchronization delay addressed macOS/Docker shared-file
visibility during rapid directory deletion/recreation. Neither is production
behavior. Isolated tests used local PHP 8.5.10. Browser tests used Chromium 151.

No FAIL remains in the final verification runs. Early failures during fixture
setup (mail class loading, VM file visibility, browser reopen/transition timing)
were corrected before the final runs.

## Compatibility and limitations

Requests still send `action`, `email`, `message`, `page_url`, and `conversation_id`.
Responses retain `ok`, `message`, `handoff_sent`, and `handoff_channels`. Contact
failure is now deliberately HTTP 503 / `ok: false`; logging disabled still
returns success. Event fields, monthly filenames, and viewer grouping are intact.
Old PHP conversations and old browser `1` completion flags migrate lazily without
mass resets. Previous visible messages cannot be recovered from an old frontend
that never stored them, but its server history is preserved.

The shared frontend remains protocol-compatible with the other adapters. The
unchanged MODX 3 adapter has the same email-only lifecycle and unconfirmed logging
limitations in its existing server code; this change does not repair them.
WordPress already keys conversations by ID and returns stored delivery results.
Neither adapter's real CMS runtime or external notification setup was verified.

Deduplication remains limited to the lifetime and reliability of the PHP session.
A provider delivery confirmation is the success criterion, not inbox receipt.
Independent conversation records stay in that visitor's session until it expires;
history remains bounded per conversation. The patch neither removes old logs nor
replays previously skipped production events.

## MODX 2 update

Follow [the file-only update steps](../modx/README.md#updating-an-existing-modx-2-installation).
Replace the adapter first, then the JS/CSS; preserve the existing JSONL directory,
settings, Lead Viewer, and PHP sessions. Refresh only static asset caches/version
references. Confirm two independent same-email inquiries in a test session.
