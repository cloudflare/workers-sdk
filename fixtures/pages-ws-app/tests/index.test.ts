import { spawn } from "child_process";
import * as path from "path";
import { upgradingFetch } from "@miniflare/web-sockets";
import type { ChildProcess } from "child_process";
import type { Response } from "miniflare";
import type { RequestInit } from "undici";

const waitUntilReady = async (url: string, requestInit?: RequestInit): Promise<Response> => {
  let response: Response | undefined = undefined;

  while (response === undefined) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));

    try {
      response = await upgradingFetch(url, requestInit);
      if(response.status === 502) response = undefined;
    } catch {}
  }

  return response as Response;
};

const isWindows = process.platform === "win32";

describe("Pages Functions", () => {
  let wranglerProcess: ChildProcess;

  beforeAll(() => {
    wranglerProcess = spawn("npm", ["run", "dev"], {
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
      wranglerProcess.kill("SIGTERM");
    });
  });

  it("understands normal fetches", async () => {
    const response = await waitUntilReady("http://localhost:8790/");
    expect(response.headers.get("x-proxied")).toBe("true");
    const text = await response.text();
    expect(text).toContain("Hello, world!");
  });

  it("understands websocket fetches", async () => {
    const response = await waitUntilReady("http://localhost:8790/ws", { headers: { "Upgrade": "websocket" } });
    expect(response.status).toBe(101);
    expect(response.webSocket).toBeDefined();
  });
});
