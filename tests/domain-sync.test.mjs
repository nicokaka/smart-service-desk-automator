import test from "node:test";
import assert from "node:assert";
import * as rendererDomain from "../renderer/domain.mjs";
import sharedDomain from "../shared/domain.js";

test("Domain functions sync - Shared vs Renderer", async (t) => {
  await t.test(
    "isPendingGeneratedMessage behaves identically",
    () => {
      const cases = ["", "Gerando...", "Erro na IA", "Falha (Limite)", "OK", null, undefined];
      for (const val of cases) {
        assert.strictEqual(
          rendererDomain.isPendingGeneratedMessage(val),
          sharedDomain.isPendingGeneratedMessage(val),
          `Failed for value: ${val}`
        );
      }
    }
  );

  await t.test("isPendingSolution behaves identically", () => {
    const cases = ["", "Gerando...", "Erro na IA.", "Solucao real", null, undefined];
    for (const val of cases) {
      assert.strictEqual(
        rendererDomain.isPendingSolution(val),
        sharedDomain.isPendingSolution(val),
        `Failed for value: ${val}`
      );
    }
  });

  await t.test("dedupeById behaves identically", () => {
    const data = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "1", name: "A_dup" },
      { name: "NoID" },
    ];
    assert.deepStrictEqual(
      rendererDomain.dedupeById(data),
      sharedDomain.dedupeById(data)
    );
  });

  await t.test("hasIncompleteQueueData behaves identically", () => {
    const data1 = { clientName: "A", departmentId: "1", subject: "S" };
    const data2 = { clientName: "A" };
    const data3 = {};

    assert.deepStrictEqual(
      rendererDomain.hasIncompleteQueueData(data1),
      sharedDomain.hasIncompleteQueueData(data1)
    );
    assert.deepStrictEqual(
      rendererDomain.hasIncompleteQueueData(data2),
      sharedDomain.hasIncompleteQueueData(data2)
    );
    assert.deepStrictEqual(
      rendererDomain.hasIncompleteQueueData(data3),
      sharedDomain.hasIncompleteQueueData(data3)
    );
  });

  await t.test("extractCreatedTicketId behaves identically", () => {
    const cases = [
      { ticket_id: "123" },
      { id: "123" },
      { data: { id: "123" } },
      {},
      null,
    ];
    for (const val of cases) {
      assert.strictEqual(
        rendererDomain.extractCreatedTicketId(val),
        sharedDomain.extractCreatedTicketId(val),
        `Failed for value: ${JSON.stringify(val)}`
      );
    }
  });

  await t.test("computeWaitTime is compatible", () => {
    assert.strictEqual(
      rendererDomain.computeWaitTime({ turbo: true, delaySeconds: "5" }),
      sharedDomain.computeWaitTime({ turbo: true, delaySeconds: "5" })
    );

    assert.strictEqual(
      rendererDomain.computeWaitTime({ delaySeconds: "3" }),
      sharedDomain.computeWaitTime({ delaySeconds: "3" })
    );
  });
});
