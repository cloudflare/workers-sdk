import { spawn, spawnSync } from "child_process";
import { resolve } from "path";
import terminate from "terminate/promise";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";
import type { Response } from "undici";

const waitUntilReady = async (url: string): Promise<Response> => {
  let response: Response | undefined = undefined;

  while (response === undefined) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));

    try {
      response = await fetch(url);
    } catch {}
  }

  return response as Response;
};

const isWindows = process.platform === "win32";

describe("Remix", () => {
  let parentProcess: ChildProcess;

  beforeAll(async () => {
    spawnSync("npm", ["run", "build"], {
      shell: isWindows,
      cwd: resolve(__dirname, "../"),
    });
    parentProcess = spawn("npm", ["run", "dev:wrangler"], {
      shell: isWindows,
      cwd: resolve(__dirname, "../"),
      env: { BROWSER: "none", ...process.env },
    });
    parentProcess.stdout?.on("data", (chunk) => {
      console.log(chunk.toString());
    });
    parentProcess.stderr?.on("data", (chunk) => {
      console.log(chunk.toString());
    });
  });

  afterAll(async () => {
    if (parentProcess.pid) {
      await terminate(parentProcess.pid);
    }
  });

  it("renders", async () => {
    const response = await waitUntilReady("http://localhost:8788/");
    const text = await response.text();
    expect(text).toContain("Welcome to Remix");
  });
});
