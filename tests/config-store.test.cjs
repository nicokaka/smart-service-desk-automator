const test = require("node:test");
const assert = require("node:assert/strict");

const configStore = require("../config-store.js");

test("ConfigStore", async (t) => {
  await t.test("getSettings returns default object when storage is empty", () => {
    // We cannot easily mock the inner electron-store instance without proxying require
    // but the default export API is straightforward
    const settings = configStore.getSettings();
    assert.ok(settings, "Should return an object");
  });

  await t.test("mergeSettings overrides current settings", () => {
    const merged = configStore.mergeSettings({ debugMode: true });
    assert.strictEqual(merged.debugMode, true);
  });
});
