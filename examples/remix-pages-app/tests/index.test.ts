import { spawn, spawnSync } from "child_process";
import * as path from "path";
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
  let wranglerProcess: ChildProcess;

  beforeAll(async () => {
    spawnSync("npm", ["run", "build"], {
      shell: isWindows,
      cwd: path.resolve(__dirname, "../"),
    });
    wranglerProcess = spawn("npm", ["run", "dev:wrangler"], {
      shell: isWindows,
      cwd: path.resolve(__dirname, "../"),
      env: { BROWSER: "none", ...process.env },
    });
    wranglerProcess.stdout?.on("data", (chunk) => {
      console.log(chunk.toString());
    });
    wranglerProcess.stderr?.on("data", (chunk) => {
      console.log(chunk.toString());
    });
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      wranglerProcess.once("exit", (code) => {
        if (!code) {
          resolve(code);
        } else {
          reject(code);
        }
      });
      wranglerProcess.kill();
    });
  });

  it("renders", async () => {
    const response = await waitUntilReady("http://localhost:8788/");
    const text = await response.text();
    expect(text).toContain("Welcome to Remix");
  });
});
