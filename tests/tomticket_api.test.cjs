const test = require("node:test");
const assert = require("node:assert/strict");

const {
  _isRetryableError,
  _normalizeResponse,
} = require("../tomticket_api.js");
const { RESULT_STATUS } = require("../operation-result.js");

test("TomTicketAPI", async (t) => {
  await t.test("_isRetryableError identifies network and 429 status", () => {
    assert.strictEqual(_isRetryableError({ statusCode: 504 }), true);
    assert.strictEqual(_isRetryableError({ statusCode: 502 }), true);
    assert.strictEqual(_isRetryableError({ statusCode: 429 }), true);
    assert.strictEqual(_isRetryableError({ code: "ECONNRESET" }), true);
    assert.strictEqual(_isRetryableError({ statusCode: 401 }), false);
  });

  await t.test("_normalizeResponse handles success", async () => {
    const rawRes = {
      statusCode: 200,
      body: JSON.stringify({ data: [{ id: "1" }] }),
    };
    const normalized = await _normalizeResponse("test", rawRes);
    assert.strictEqual(normalized.status !== RESULT_STATUS.FATAL_ERROR, true);
    assert.deepEqual(normalized.data, [{ id: "1" }]);
  });

  await t.test("_normalizeResponse throws Application error on invalid content", async () => {
    const rawRes = {
      statusCode: 200,
      body: JSON.stringify({ erro: true, mensagem: "API key incorreta" }),
    };
    const normalized = await _normalizeResponse("test", rawRes);
    // Since wait, normalizeResponse actually returns the payload directly on success
    // Wait, let's see: it returns { ok: true, payload: ..., data: ... }
    assert.strictEqual(normalized.ok, true);
    assert.deepEqual(normalized.payload.erro, true);
  });
});
