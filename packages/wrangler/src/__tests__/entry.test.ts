import { writeFile } from "fs/promises";
import path from "path";
import guessWorkerFormat from "../entry";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";

describe("entry", () => {
  runInTempDir();
  mockConsoleMethods();

  it("should error when encountering a service worker with a durable object implementation", async () => {
    await writeFile(
      "./index.ts",
      "addEventListener('fetch', () => \"hello, world!\")"
    );
    writeWranglerToml({
      main: "index.ts",
      durable_objects: {
        bindings: [
          {
            name: "THIS_SHOULD_FAIL",
            class_name: "ThisShouldFail",
            script_name: "this-should-fail.js",
          },
        ],
      },
    });

    await expect(runWrangler("publish")).rejects
      .toThrowErrorMatchingInlineSnapshot(`
            "You cannot implement a Durable Object in a Service Worker, and should migrate to the Module format instead.
            https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/"
          `);
  });

  it("should error when encountering a service worker with a per-environment durable object implementation", async () => {
    await writeFile(
      "./index.ts",
      "addEventListener('fetch', () => \"hello, world!\")"
    );
    writeWranglerToml({
      main: "index.ts",
      env: {
        ENV_1: {
          durable_objects: {
            bindings: [
              {
                name: "THIS_SHOULD_FAIL",
                class_name: "ThisShouldFail",
                script_name: "this-should-fail.js",
              },
            ],
          },
        },
      },
    });

    await expect(runWrangler("publish")).rejects
      .toThrowErrorMatchingInlineSnapshot(`
            "You cannot implement a Durable Object in a Service Worker, and should migrate to the Module format instead.
            https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/"
          `);
  });

  it("should allow service workers to bind to durable objects defined elsewhere", async () => {
    await writeFile(
      "./index.ts",
      "addEventListener('fetch', () => \"hello, world!\")"
    );
    writeWranglerToml({
      main: "index.ts",
      durable_objects: {
        bindings: [
          {
            name: "THIS_SHOULD_PASS",
            class_name: "ThisShouldPass",
          },
        ],
      },
    });

    await expect(
      runWrangler("publish")
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Did not login, quitting..."`
    );
  });

  it("should allow service workers to bind to per-environment durable objects defined elsewhere", async () => {
    await writeFile(
      "./index.ts",
      "addEventListener('fetch', () => \"hello, world!\")"
    );
    writeWranglerToml({
      main: "index.ts",
      env: {
        ENV_1: {
          durable_objects: {
            bindings: [
              {
                name: "THIS_SHOULD_PASS",
                class_name: "ThisShouldPass",
              },
            ],
          },
        },
      },
    });

    await expect(
      runWrangler("publish")
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Did not login, quitting..."`
    );
  });

  describe("guess worker format", () => {
    it('should detect a "modules" worker', async () => {
      await writeFile("./index.ts", "export default {};");
      // Note that this isn't actually a valid worker, because it's missing
      // a fetch handler. Regardless, our heuristic is simply to check for exports.
      const guess = await guessWorkerFormat(
        path.join(process.cwd(), "./index.ts"),
        process.cwd(),
        undefined
      );
      expect(guess).toBe("modules");
    });

    it('should detect a "service-worker" worker', async () => {
      await writeFile("./index.ts", "");
      // Note that this isn't actually a valid worker, because it's missing
      // a fetch listener. Regardless, our heuristic is simply to check for
      // the lack of exports.
      const guess = await guessWorkerFormat(
        path.join(process.cwd(), "./index.ts"),
        process.cwd(),
        undefined
      );
      expect(guess).toBe("service-worker");
    });

    it("should throw an error when the hint doesn't match the guess (modules - service-worker)", async () => {
      await writeFile("./index.ts", "export default {};");
      await expect(
        guessWorkerFormat(
          path.join(process.cwd(), "./index.ts"),
          process.cwd(),
          "service-worker"
        )
      ).rejects.toThrow(
        "You configured this worker to be a 'service-worker', but the file you are trying to build appears to have ES module exports. Please pass `--format modules`, or simply remove the configuration."
      );
    });

    it("should throw an error when the hint doesn't match the guess (service-worker - modules)", async () => {
      await writeFile("./index.ts", "");
      await expect(
        guessWorkerFormat(
          path.join(process.cwd(), "./index.ts"),
          process.cwd(),
          "modules"
        )
      ).rejects.toThrow(
        "You configured this worker to be 'modules', but the file you are trying to build doesn't export a handler. Please pass `--format service-worker`, or simply remove the configuration."
      );
    });
  });
});
