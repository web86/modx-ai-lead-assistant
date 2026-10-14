# Regression tests

Requirements: Node.js 20+, PHP with cURL and mbstring, and Playwright Chromium.
Run with a non-root PHP user so the filesystem-permission test is meaningful.

```sh
npm ci
npx playwright install chromium
npm test
ASSISTANT_TEST_BROWSER=1 npm run test:server
```

`test:server` runs 17 scenarios against an unchanged copy of the actual MODX 2
adapter over HTTP. A temporary bootstrap mocks the MODX API, mail service, AI,
and Telegram. It exercises real PHP sessions and real monthly JSONL writes.
It deletes only its generated temporary directory and shuts down its servers.
`ASSISTANT_TEST_BROWSER=1` adds a full HTTP Chromium widget scenario: failed
contact, refresh/retry, history restoration, and three independently delivered
same-email conversations in one browser and PHP session.

`test:browser` runs 21 Chromium scenarios across MODX 2, MODX 3, and WordPress
endpoint formats with mocked CMS responses. It checks contact endpoint routing,
error visibility, pending/confirmed email storage, ID-scoped handoff status,
refresh/reopen, transcript restoration, email change, interrupted contact saves,
legacy completion migration, and three independent same-email conversations.
`TEST_FIREFOX=1 npm run test:browser` also runs Firefox if installed.

## Optional real MODX 2 runtime

The bootstrap supports `ASSISTANT_REAL_MODX_ROOT`, pointing to an existing local
test MODX 2 installation. It loads real modX/xPDO/modChunk/modMail classes and
initializes the real web context. Test configuration and the AI-rules chunk are
overridden only in memory. Mail remains a recording mock; Telegram and AI still
use the local test gateway. Assistant diagnostics are recorded via the real MODX
logger into the temporary test directory. CMS settings/chunks are not saved.
Do not point this fixture at a production installation.

`ASSISTANT_PHP_BINARY` optionally names an executable wrapper that receives the
PHP server CLI arguments, allowing a PHP container with the real MODX runtime.
The wrapper must expose the selected server port on localhost, make the generated
temporary directory available at the same absolute path, and stop its container
when terminated. Set `ASSISTANT_GATEWAY_HOST` if the container must reach the
mock gateway through `host.docker.internal`. `ASSISTANT_FIXTURE_SETTLE_MS` adds a
configuration synchronization delay for macOS/VM shared filesystems; it is not
part of production code. `ASSISTANT_TEST_DIAGNOSTICS=1` prints fixture responses
and server diagnostics on failure.

Example for a prepared container wrapper:

```sh
TMPDIR=/private/tmp \
ASSISTANT_PHP_BINARY=/path/to/local-test-php-wrapper \
ASSISTANT_GATEWAY_HOST=host.docker.internal \
ASSISTANT_FIXTURE_SETTLE_MS=1100 \
ASSISTANT_TEST_BROWSER=1 \
npm run test:server
```

## Coverage

The server tests cover contact/first-request deduplication, same-email independent
IDs, changed email, history continuation, returning to a previously delivered ID,
separate visitor sessions, parallel retries, legacy active/delivered session
migration, uncreatable/unwritable directories, JSONL write failure and retry,
intentional disabled logging, partial/all channel failures, and successful
delivery despite diagnostic write failure.

These tests intentionally send no real email or Telegram notifications. The
parallel test runs on the PHP development server (which serializes requests);
concurrent multi-worker/FPM stress is not covered. Session deduplication does not
survive expired/lost PHP sessions.

The MODX 3 and WordPress browser tests verify the shared frontend's existing wire
contract with safe mocks. They are not full CMS runtime tests. The unchanged MODX 3
adapter still has email-only session identity and unconfirmed contact-write
behavior; fixing it is outside this MODX 2 change. Its server-side limitations
cannot be corrected by frontend compatibility tests.
