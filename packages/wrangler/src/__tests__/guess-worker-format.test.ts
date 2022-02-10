import { writeFile } from "fs/promises";
import path from "path";
import guessWorkerFormat from "../guess-worker-format";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("guess worker format", () => {
  runInTempDir();
  it('should detect a "modules" worker', async () => {
    await writeFile("./index.ts", "export default {};");
    // Note that this isn't actually a valid worker, because it's missing
    // a fetch handler. Regardless, our heuristic is simply to check for exports.
    const guess = await guessWorkerFormat(
      path.join(process.cwd(), "./index.ts"),
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
      undefined
    );
    expect(guess).toBe("service-worker");
  });

  it("should throw an error when the hint doesn't match the guess (modules - service-worker)", async () => {
    await writeFile("./index.ts", "export default {};");
    await expect(
      guessWorkerFormat(
        path.join(process.cwd(), "./index.ts"),
        "service-worker"
      )
    ).rejects.toThrow(
      "You configured this worker to be a 'service-worker', but the file you are trying to build appears to have ES module exports. Please pass `--format modules`, or simply remove the configuration."
    );
  });

  it("should throw an error when the hint doesn't match the guess (service-worker - modules)", async () => {
    await writeFile("./index.ts", "");
    await expect(
      guessWorkerFormat(path.join(process.cwd(), "./index.ts"), "modules")
    ).rejects.toThrow(
      "You configured this worker to be 'modules', but the file you are trying to build doesn't export a handler. Please pass `--format service-worker`, or simply remove the configuration."
    );
  });
});
