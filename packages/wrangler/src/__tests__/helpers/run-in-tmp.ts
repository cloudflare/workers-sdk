import * as fs from "node:fs";
import os from "node:os";
import * as path from "node:path";
import { reinitialiseAuthTokens } from "../../user";

const originalCwd = process.cwd();

export function runInTempDir({ homedir }: { homedir?: string } = {}) {
  let tmpDir: string;

  beforeAll(() => {
    if (tmpDir !== undefined) {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-tests"));
    process.chdir(tmpDir);
    if (homedir !== undefined) {
      // Override where the home directory is so that we can write our own user config,
      // without destroying the real thing.
      fs.mkdirSync(homedir);
      // Note it is very important that we use the "default" value from "node:os" (e.g. `import os from "node:os";`)
      // rather than an alias to the module (e.g. `import * as os from "node:os";`).
      // This is because the module gets transpiled so that the "method" `homedir()` gets converted to a
      // getter that is not configurable (and so cannot be spied upon).
      jest.spyOn(os, "homedir").mockReturnValue(homedir);
      // Now that we have changed the home directory location, we must reinitialize the user auth state
      reinitialiseAuthTokens();
    }
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true });
  });
}
