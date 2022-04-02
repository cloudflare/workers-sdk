import { spawn } from "child_process";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";
import type { Response } from "undici";

const waitUntilReady = async (url: string): Promise<Response> => {
  let response: Response | undefined = undefined;

  while (response === undefined) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));

    try {
      response = await fetch(url);
    } catch {}
  }

  return response as Response;
};
const isWindows = process.platform === "win32";

let wranglerProcess: ChildProcess;

beforeAll(async () => {
  wranglerProcess = spawn("npx", ["wrangler", "dev", "--local"], {
    shell: isWindows,
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
  const response = await waitUntilReady("http://localhost:8787/");
  const text = await response.text();
  expect(text).toContain("Hello World!");
});
