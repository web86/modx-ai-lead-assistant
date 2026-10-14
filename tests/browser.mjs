import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, firefox } from "playwright";
const html = await readFile("frontend/assistant.html", "utf8");
const script = await readFile(process.env.ASSISTANT_FRONTEND_SOURCE || "frontend/assistant.js", "utf8");
const css = await readFile("frontend/assistant.css", "utf8");
const browsers = process.env.TEST_FIREFOX ? [chromium, firefox] : [chromium];
let failures = 0, count = 0;
for (const engine of browsers) {
  const browser = await engine.launch({ headless: true });
  for (const endpoint of ["/assets/components/assistant/api/chat.php", "/modx3/api/chat.php", "/wp-json/web86-ai-lead/v1/chat"]) {
    const context = await browser.newContext();
    let requests = [], contactFailure = false, contactDelay = 0;
    const delivered = /* @__PURE__ */ new Map();
    await context.route("http://assistant.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "POST") {
        const data = route.request().postDataJSON();
        requests.push({ path: url.pathname, ...data });
        if (data.action === "contact") {
          if (contactDelay) await new Promise((r) => setTimeout(r, contactDelay));
          await route.fulfill({ status: contactFailure ? 503 : 200, json: contactFailure ? { ok: false, error: "/private/secret/path" } : { ok: true } });
        } else {
          const handoff = data.message.startsWith("send");
          if (handoff) delivered.set(data.conversation_id, (delivered.get(data.conversation_id) || 0) + 1);
          await route.fulfill({ json: { ok: true, message: handoff ? "Delivered." : "Reply to " + data.message, handoff_sent: handoff, handoff_channels: { email: true, telegram: false } } });
        }
      } else if (url.pathname.endsWith(".js")) await route.fulfill({ contentType: "text/javascript", body: script });
      else if (url.pathname.endsWith(".css")) await route.fulfill({ contentType: "text/css", body: css });
      else await route.fulfill({ contentType: "text/html", body: html.replace('data-endpoint="/assets/components/assistant/api/chat.php"', `data-endpoint="${endpoint}"`) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5e3);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    async function load() {
      await page.goto("http://assistant.test/");
      await page.locator("#fwAssistantTrigger").click();
    }
    async function email(value = "visitor@example.test") {
      await page.locator("input[type=email]").fill(value);
      await page.locator(".fw-assistant-email-form button").click();
    }
    async function chatting() {
      await page.waitForFunction(() => document.getElementById("fwAssistant").classList.contains("is-chatting"));
    }
    async function message(value) {
      await page.locator("#fwAssistantInput").fill(value);
      await page.locator(".fw-assistant-send").click();
      await page.waitForFunction(() => !document.querySelector(".fw-assistant-typing"));
    }
    async function state() {
      return page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
    }
    async function test(name, fn) {
      count++;
      try {
        await fn();
        console.log(`PASS ${engine.name()} ${endpoint}: ${name}`);
      } catch (e) {
        failures++;
        console.error(`FAIL ${engine.name()} ${endpoint}: ${name}: ${e.stack}`);
      }
    }
    try {
      await load();
      await test("contact failure stays on email card; refresh and retry preserve email and ID", async () => {
        contactFailure = true;
        await email();
        await page.locator(".fw-assistant-email-error").waitFor();
        let s = await state();
        assert.equal(s.fwAssistantEmail, void 0);
        const id = s.fwAssistantConversationId;
        assert.equal(await page.locator("#fwAssistant").evaluate((e) => e.classList.contains("is-chatting")), false);
        assert.equal(await page.locator("input[type=email]").inputValue(), "visitor@example.test");
        assert.ok(!(await page.locator(".fw-assistant-email-error").textContent()).includes("/private"));
        await page.reload();
        await page.locator("#fwAssistantTrigger").click();
        assert.equal(await page.locator("input[type=email]").inputValue(), "visitor@example.test");
        contactFailure = false;
        await page.locator(".fw-assistant-email-form button").click();
        await chatting();
        s = await state();
        assert.equal(s.fwAssistantEmail, "visitor@example.test");
        assert.equal(s.fwAssistantConversationId, id);
        assert.equal(requests.filter((r) => r.action === "contact").length, 2);
        assert.equal(requests[0].conversation_id, requests[1].conversation_id);
        const contactPath = endpoint.endsWith("/chat") ? endpoint.replace(/\/chat$/, "/contact") : endpoint;
        assert.equal(requests[0].path, contactPath);
      });
      await test("close/reopen and refresh retain ID, email and visible transcript", async () => {
        await message("first request");
        const before = await state();
        await page.locator(".fw-assistant-close").click();
        await page.locator("#fwAssistantTrigger").click();
        assert.equal((await state()).fwAssistantConversationId, before.fwAssistantConversationId);
        await page.reload();
        await page.locator("#fwAssistantTrigger").click();
        await chatting();
        assert.equal((await state()).fwAssistantConversationId, before.fwAssistantConversationId);
        assert.ok((await page.locator("#fwAssistantMessages").textContent()).includes("Reply to first request"));
      });
      await test("completed state belongs to ID, refresh sends nothing, three independent same-email leads", async () => {
        const ids = [];
        for (let i = 0; i < 3; i++) {
          ids.push((await state()).fwAssistantConversationId);
          await message("send " + i);
          await page.waitForFunction(() => document.getElementById("fwAssistantInput").disabled);
          const s = await state();
          assert.equal(s.fwAssistantHandoffSent, s.fwAssistantConversationId);
          const n = requests.length;
          await page.reload();
          await page.locator("#fwAssistantTrigger").click();
          await chatting();
          assert.equal(requests.length, n);
          assert.equal(await page.locator("#fwAssistantInput").isDisabled(), true);
          await page.locator(".fw-assistant-new-chat").waitFor({ state: "visible" });
          if (i < 2) {
            await page.locator(".fw-assistant-new-chat").click();
            assert.equal(await page.locator("input[type=email]").inputValue(), "visitor@example.test");
            await email();
            await chatting();
          }
        }
        assert.equal(new Set(ids).size, 3);
        assert.equal(delivered.size, 3);
      });
      await test("email change after failed pending contact resets ID, history and completion", async () => {
        await page.locator(".fw-assistant-new-chat").click();
        contactFailure = true;
        await email();
        await page.locator(".fw-assistant-email-error").waitFor();
        const old = (await state()).fwAssistantConversationId;
        contactFailure = false;
        await email("different@example.test");
        await chatting();
        const s = await state();
        assert.notEqual(s.fwAssistantConversationId, old);
        assert.equal(s.fwAssistantEmail, "different@example.test");
        assert.equal(s.fwAssistantHandoffSent, void 0);
        assert.ok(!(await page.locator("#fwAssistantMessages").textContent()).includes("Delivered."));
      });
      await test("refresh during contact save cannot unlock chat or lose pending identity", async () => {
        await page.evaluate(() => sessionStorage.clear());
        await page.reload();
        await page.locator("#fwAssistantTrigger").click();
        contactDelay = 300;
        const n = requests.length;
        await email();
        await page.waitForFunction(() => sessionStorage.getItem("fwAssistantPendingEmail"));
        const id = (await state()).fwAssistantConversationId;
        await page.reload();
        await page.locator("#fwAssistantTrigger").click();
        contactDelay = 0;
        assert.equal((await state()).fwAssistantEmail, void 0);
        assert.equal((await state()).fwAssistantConversationId, id);
        await page.locator(".fw-assistant-email-form button").click();
        await chatting();
        assert.equal((await state()).fwAssistantConversationId, id);
        assert.ok(requests.length >= n + 1);
      });
      await test("legacy completion migrates once without any automatic send", async () => {
        await page.evaluate(() => {
          sessionStorage.clear();
          sessionStorage.setItem("fwAssistantEmail", "legacy@example.test");
          sessionStorage.setItem("fwAssistantConversationId", "legacy_conversation_1");
          sessionStorage.setItem("fwAssistantHandoffSent", "1");
        });
        const n = requests.length;
        await page.reload();
        await page.locator("#fwAssistantTrigger").click();
        await chatting();
        assert.equal(requests.length, n);
        assert.equal((await state()).fwAssistantHandoffSent, "legacy_conversation_1");
        assert.equal(await page.locator("#fwAssistantInput").isDisabled(), true);
      });
      await test("stale handoff flag for another ID cannot finish current chat", async () => {
        await page.evaluate(() => {
          sessionStorage.setItem("fwAssistantHandoffSent", "old_conversation_id");
          sessionStorage.setItem("fwAssistantConversationId", "new_conversation_id");
        });
        await page.reload();
        await page.locator("#fwAssistantTrigger").click();
        await chatting();
        assert.equal(await page.locator("#fwAssistantInput").isDisabled(), false);
        assert.equal(errors.length, 0, errors.join("\n"));
      });
    } finally {
      await context.close();
    }
  }
  await browser.close();
}
console.log(`${count - failures}/${count} browser scenarios passed`);
if (failures) process.exitCode = 1;
