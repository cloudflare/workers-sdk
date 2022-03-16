import { spawn } from "child_process";
import { resolve } from "path";
import { fetch } from "undici";
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
  beforeAll(async () => {
    const wranglerProcess = spawn("npm", ["run", "dev"], {
      shell: isWindows,
      cwd: resolve(__dirname, "../"),
      env: { BROWSER: "none", ...process.env },
    });
    wranglerProcess.stdout.on("data", (chunk) => {
      console.log(chunk.toString());
    });
    wranglerProcess.stderr.on("data", (chunk) => {
      console.log(chunk.toString());
    });
  });

  it("renders static pages", async () => {
    const response = await waitUntilReady("http://localhost:8789/");
    const text = await response.text();
    expect(text).toContain("Hello, world!");
  });

  it("intercepts static requests with next()", async () => {
    const response = await waitUntilReady("http://localhost:8789/intercept");
    const text = await response.text();
    expect(text).toContain("Hello, world!");
    expect(response.headers.get("x-set-from-functions")).toBe("true");
  });

  it("can make SSR responses", async () => {
    const response = await waitUntilReady("http://localhost:8789/date");
    const text = await response.text();
    expect(text).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
  });

  it("can use parameters", async () => {
    const response = await waitUntilReady(
      "http://localhost:8789/blog/hello-world"
    );
    const text = await response.text();
    expect(text).toContain("<h1>A blog with a slug: hello-world</h1>");
  });
});
