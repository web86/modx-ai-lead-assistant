import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, rm, chmod, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
const root = await mkdtemp(join(tmpdir(), "assistant-test-"));
const api = join(root, "assets/components/assistant/api");
await mkdir(api, { recursive: true });
await mkdir(join(root, "sessions"));
await copyFile(resolve(process.env.ASSISTANT_SOURCE || "modx/chat.php"), join(api, "chat.php"));
await copyFile(resolve("tests/fixtures/modx.php"), join(root, "index.php"));
await copyFile(resolve("tests/fixtures/gateway.php"), join(root, "gateway.php"));
await copyFile(resolve("tests/fixtures/session.php"), join(root, "seed-session.php"));
async function port() {
  const s = createServer();
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const webPort = await port(), gatewayPort = await port();
const children = [spawn(process.env.ASSISTANT_PHP_BINARY || "php", ["-d", "display_errors=0", "-d", `session.save_path=${root}/sessions`, "-S", `0.0.0.0:${webPort}`, "-t", root]), spawn("php", ["-d", "display_errors=0", "-S", `0.0.0.0:${gatewayPort}`, join(root, "gateway.php")])];
let output = "";
children.forEach((p) => p.stderr.on("data", (b) => output += b));
let failures = 0;
const base = { "portfolio_assistant.enabled": 1, "portfolio_assistant.gateway_url": `http://${process.env.ASSISTANT_GATEWAY_HOST || "127.0.0.1"}:${gatewayPort}/chat`, "portfolio_assistant.gateway_secret": "local-test-only", "portfolio_assistant.email_to": "owner@example.test", "portfolio_assistant.telegram_enabled": 1, "portfolio_assistant.telegram_gateway_url": `http://${process.env.ASSISTANT_GATEWAY_HOST || "127.0.0.1"}:${gatewayPort}/telegram`, "portfolio_assistant.log_path": join(root, "logs"), email_success: true, telegram_success: true };
let config, cookie = "";
async function configure(patch = {}) {
  config = { ...base, ...patch };
  await writeFile(join(root, "config.tmp"), JSON.stringify(config));
  await rename(join(root, "config.tmp"), join(root, "config.json"));
  if (process.env.ASSISTANT_FIXTURE_SETTLE_MS) await new Promise((r) => setTimeout(r, Number(process.env.ASSISTANT_FIXTURE_SETTLE_MS)));
}
async function rows(file) {
  try {
    return (await readFile(join(root, file), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
async function events() {
  try {
    const files = await readdir(join(root, "logs"));
    return (await Promise.all(files.map((f) => rows("logs/" + f)))).flat();
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
async function request(action, id = "conversation_00001", email = "visitor@example.test", message = "hello") {
  const response = await fetch(`http://127.0.0.1:${webPort}/assets/components/assistant/api/chat.php`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ action, email, message, conversation_id: id, page_url: "http://example.test/" }) });
  cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
  const result = { status: response.status, ...await response.json() };
  if (process.env.ASSISTANT_TEST_DIAGNOSTICS) console.log("RESULT", action, id, result);
  return result;
}
async function reset() {
  cookie = "";
  await rm(join(root, "logs"), { recursive: true, force: true });
  for (const f of ["mail.jsonl", "gateway.jsonl", "errors.jsonl"]) await rm(join(root, f), { force: true });
  await configure();
}
async function test(name, fn) {
  await reset();
  try {
    await fn();
    console.log("PASS " + name);
  } catch (e) {
    failures++;
    console.error("FAIL " + name + ": " + e.message);
    if (process.env.ASSISTANT_TEST_DIAGNOSTICS) console.error(await rows("errors.jsonl"));
  }
}
try {
  await configure();
  for (let i = 0; i < 200; i++) {
    try {
      await fetch(`http://127.0.0.1:${webPort}/`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  if (children[0].exitCode !== null) throw new Error("PHP server failed: " + output);
  await test("contact and first_request are logged once; resumed history survives", async () => {
    assert.equal((await request("contact")).ok, true);
    await request("contact");
    await request("message");
    await request("message", void 0, void 0, "second");
    assert.deepEqual((await events()).map((e) => e.event), ["contact_saved", "first_request"]);
    const turns = (await rows("gateway.jsonl")).filter((e) => e.path === "/chat");
    assert.equal(turns[1].payload.input[0].content, "hello");
  });
  await test("three same-email conversations in one PHP session get independent delivery and logs", async () => {
    for (let i = 1; i <= 3; i++) {
      const id = "same_email_conversation_" + i;
      assert.equal((await request("contact", id)).ok, true);
      assert.equal((await request("message", id, void 0, "send " + i)).handoff_sent, true);
    }
    assert.equal((await events()).length, 9);
    assert.equal((await rows("mail.jsonl")).length, 3);
  });
  await test("different email and ID isolate history", async () => {
    await request("message");
    await request("message", "conversation_00002", "other@example.test", "other");
    const turns = await rows("gateway.jsonl");
    assert.deepEqual(turns[1].payload.input, [{ role: "user", content: "other" }]);
  });
  await test("same ID with different email cannot inherit delivery/history", async () => {
    await request("message", void 0, void 0, "send");
    assert.equal((await request("message", void 0, "other@example.test", "send")).handoff_sent, true);
    assert.equal((await rows("mail.jsonl")).length, 2);
  });
  await test("replayed delivered conversation returns original channels without any sends or AI calls", async () => {
    const first = await request("message", void 0, void 0, "send");
    const second = await request("message", void 0, void 0, "send");
    assert.equal(second.handoff_sent, true);
    assert.deepEqual(second.handoff_channels, first.handoff_channels);
    assert.equal((await rows("mail.jsonl")).length, 1);
    assert.equal((await rows("gateway.jsonl")).length, 2);
  });
  await test("switching IDs and returning to a completed conversation never redelivers", async () => {
    await request("message", void 0, void 0, "send");
    await request("message", "conversation_00002", void 0, "send");
    await request("message", void 0, void 0, "send");
    assert.equal((await rows("mail.jsonl")).length, 2);
  });
  await test("separate visitor session cannot inherit another visitor history or handoff", async () => {
    await request("message", void 0, void 0, "send");
    cookie = "";
    const result = await request("message", void 0, void 0, "new visitor");
    assert.equal(result.handoff_sent, false);
    const turns = (await rows("gateway.jsonl")).filter((e) => e.path === "/chat");
    assert.deepEqual(turns.at(-1).payload.input, [{ role: "user", content: "new visitor" }]);
  });
  await test("parallel retries of one handoff produce one notification set", async () => {
    await request("contact");
    const results = await Promise.all([request("message", void 0, void 0, "send"), request("message", void 0, void 0, "send")]);
    assert.ok(results.every((r) => r.handoff_sent));
    assert.equal((await rows("mail.jsonl")).length, 1);
  });
  await test("legacy in-progress PHP session migrates without losing history or repeating contact", async () => {
    const seed = await fetch(`http://127.0.0.1:${webPort}/seed-session.php`);
    cookie = seed.headers.get("set-cookie").split(";")[0];
    await request("message", "legacy_conversation_01", void 0, "continued");
    assert.deepEqual((await rows("gateway.jsonl"))[0].payload.input.map((i) => i.content), ["Legacy history", "Legacy reply", "continued"]);
    assert.equal((await events()).length, 0);
  });
  await test("legacy delivered PHP session migrates without redelivery", async () => {
    const seed = await fetch(`http://127.0.0.1:${webPort}/seed-session.php?delivered=1`);
    cookie = seed.headers.get("set-cookie").split(";")[0];
    const result = await request("message", "legacy_conversation_01", void 0, "send");
    assert.equal(result.handoff_sent, true);
    assert.equal(result.message, "Legacy delivered");
    assert.equal((await rows("mail.jsonl")).length, 0);
  });
  await test("uncreatable log directory fails contact and blocks message without private error details; retry works", async () => {
    await writeFile(join(root, "blocked"), "x");
    await configure({ "portfolio_assistant.log_path": join(root, "blocked/sub") });
    const result = await request("contact");
    assert.equal(result.status, 503);
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(root));
    assert.equal((await request("message")).ok, false);
    assert.equal((await rows("gateway.jsonl")).length, 0);
    await configure();
    assert.equal((await request("contact")).ok, true);
    assert.equal((await events()).length, 1);
    assert.ok((await rows("errors.jsonl")).some((e) => e.includes("contact")));
  });
  await test("non-writable directory is reported", async () => {
    await mkdir(join(root, "logs"));
    await chmod(join(root, "logs"), 320);
    try {
      assert.equal((await request("contact")).ok, false);
      assert.ok((await rows("errors.jsonl")).some((e) => e.includes("not writable")));
    } finally {
      await chmod(join(root, "logs"), 448);
    }
  });
  await test("JSONL write failure is explicit and retryable", async () => {
    await mkdir(join(root, "logs", (/* @__PURE__ */ new Date()).toISOString().slice(0, 7) + "-AILeadLogs.jsonl"), { recursive: true });
    assert.equal((await request("contact")).ok, false);
    await rm(join(root, "logs"), { recursive: true });
    await configure();
    assert.equal((await request("contact")).ok, true);
    assert.equal((await events()).length, 1);
  });
  await test("intentional disabled logging allows contact and handoff", async () => {
    await configure({ "portfolio_assistant.log_enabled": 0 });
    assert.equal((await request("contact")).ok, true);
    assert.equal((await request("message", void 0, void 0, "send")).handoff_sent, true);
    assert.equal((await events()).length, 0);
    assert.equal((await rows("errors.jsonl")).length, 0);
  });
  await test("Email failure + Telegram success is delivered, with diagnostic", async () => {
    await configure({ email_success: false });
    const result = await request("message", void 0, void 0, "send");
    assert.equal(result.handoff_sent, true);
    assert.deepEqual(result.handoff_channels, { email: false, telegram: true });
    assert.ok((await rows("errors.jsonl")).some((e) => /email/i.test(e)));
  });
  await test("both channels fail: explicit failure message and safe retry", async () => {
    await configure({ email_success: false, telegram_success: false });
    const result = await request("message", void 0, void 0, "send");
    assert.equal(result.handoff_sent, false);
    assert.match(result.message, /could not.*send/i);
    assert.equal((await events()).at(-1).event, "handoff_failed");
    const errors = await rows("errors.jsonl");
    assert.ok(errors.some((e) => /email/i.test(e)));
    assert.ok(errors.some((e) => /Telegram/.test(e)));
    await configure();
    assert.equal((await request("message", void 0, void 0, "send")).handoff_sent, true);
  });
  await test("successful delivery survives diagnostic JSONL write failure", async () => {
    await configure({ fail_log_after_delivery: true });
    const first = await request("message", void 0, void 0, "send");
    assert.equal(first.handoff_sent, true);
    const second = await request("message", void 0, void 0, "send");
    assert.equal(second.handoff_sent, true);
    assert.equal((await rows("mail.jsonl")).length, 1);
  });
  if (process.env.ASSISTANT_TEST_BROWSER) {
    await test("HTTP browser integration: contact retry, refresh, and three same-email handoffs in one session", async () => {
      const { chromium } = await import("playwright");
      await mkdir(join(root, "assets/components/assistant/js"), { recursive: true });
      await mkdir(join(root, "assets/components/assistant/css"), { recursive: true });
      await copyFile(resolve("frontend/assistant.js"), join(root, "assets/components/assistant/js/assistant.js"));
      await copyFile(resolve("frontend/assistant.css"), join(root, "assets/components/assistant/css/assistant.css"));
      await copyFile(resolve("frontend/assistant.html"), join(root, "widget.html"));
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const origin = `http://127.0.0.1:${webPort}`;
        const open = async () => {
          await page.locator("#fwAssistantTrigger").click();
        };
        const ready = async () => {
          await page.waitForFunction(() => document.getElementById("fwAssistant").classList.contains("is-chatting"));
        };
        await configure({ "portfolio_assistant.log_path": join(root, "not-a-directory/child") });
        await writeFile(join(root, "not-a-directory"), "blocked");
        await page.goto(origin + "/widget.html");
        await open();
        await page.locator("input[type=email]").fill("browser@example.test");
        await page.locator(".fw-assistant-email-form button").click();
        await page.locator(".fw-assistant-email-error").waitFor();
        const pendingId = await page.evaluate(() => sessionStorage.getItem("fwAssistantConversationId"));
        assert.equal(await page.evaluate(() => sessionStorage.getItem("fwAssistantEmail")), null);
        await configure();
        await page.reload();
        await open();
        await page.locator(".fw-assistant-email-form button").click();
        await ready();
        assert.equal(await page.evaluate(() => sessionStorage.getItem("fwAssistantConversationId")), pendingId);
        await page.locator("#fwAssistantInput").fill("first browser request");
        await page.locator(".fw-assistant-send").click();
        await page.waitForFunction(() => !document.querySelector(".fw-assistant-typing"));
        await page.reload();
        await ready();
        await open();
        assert.match(await page.locator("#fwAssistantMessages").textContent(), /Tell me more/);
        const ids = [];
        for (let i = 0; i < 3; i++) {
          ids.push(await page.evaluate(() => sessionStorage.getItem("fwAssistantConversationId")));
          await page.locator("#fwAssistantInput").fill("send browser " + i);
          await page.locator(".fw-assistant-send").click();
          await page.waitForFunction(() => document.getElementById("fwAssistantInput").disabled);
          await page.reload();
          await ready();
          await open();
          assert.equal(await page.locator("#fwAssistantInput").isDisabled(), true);
          if (i < 2) {
            await page.locator(".fw-assistant-new-chat").click();
            await page.locator(".fw-assistant-email-form button").click();
            await ready();
          }
        }
        assert.equal(new Set(ids).size, 3);
        assert.equal((await rows("mail.jsonl")).length, 3);
        assert.deepEqual((await events()).map((e) => e.event), Array(3).fill(["contact_saved", "first_request", "handoff_success"]).flat());
      } finally {
        await browser.close();
      }
    });
  }
} finally {
  children.forEach((p) => p.kill());
  await Promise.all(children.map((p) => p.exitCode === null ? once(p, "exit") : Promise.resolve()));
  await rm(root, { recursive: true, force: true });
}
if (failures) {
  if (process.env.ASSISTANT_TEST_DIAGNOSTICS) console.error(output);
  process.exitCode = 1;
}
