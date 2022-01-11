import * as os from "node:os";
import * as path from "node:path";
import * as fs from "fs";

const originalCwd = process.cwd();

export function runInTempDir() {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-tests"));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true });
  });
}
