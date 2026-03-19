const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RESULT_STATUS,
  combineStatuses,
  getLogLevel,
  partialResult,
  retryableErrorResult,
  successResult,
} = require("../operation-result");

test("combineStatuses returns success only when all operations succeed", () => {
  assert.equal(
    combineStatuses([
      { status: RESULT_STATUS.SUCCESS },
      { status: RESULT_STATUS.SUCCESS },
    ]),
    RESULT_STATUS.SUCCESS,
  );
});

test("combineStatuses degrades to partial when mixed results are present", () => {
  assert.equal(
    combineStatuses([
      { status: RESULT_STATUS.SUCCESS },
      { status: RESULT_STATUS.FATAL_ERROR },
    ]),
    RESULT_STATUS.PARTIAL,
  );
});

test("operation result factories expose explicit operational semantics", () => {
  const success = successResult("op", { ok: true }, "ok");
  assert.equal(success.success, true);
  assert.equal(success.partial, false);

  const partial = partialResult("op", "partial", { ok: true });
  assert.equal(partial.status, RESULT_STATUS.PARTIAL);
  assert.equal(partial.partial, true);

  const retryable = retryableErrorResult("op", new Error("retry later"));
  assert.equal(retryable.retryable, true);
  assert.equal(getLogLevel(retryable.status), "warn");
});
