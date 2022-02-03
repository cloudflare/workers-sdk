import { spawn } from "child_process";
import { fetch } from "undici";
import type { Response } from "undici";

const waitUntilReady = async (url: string): Promise<Response> => {
  let response: Response | undefined = undefined;

  while (response === undefined) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      response = await fetch(url);
    } catch {}
  }

  return response as Response;
};

describe("Remix", () => {
  beforeAll(async () => {
    spawn("npm run dev:remix", { shell: true });
    spawn("BROWSER=none npm run dev:wrangler", { shell: true });
  });

  it("renders", async () => {
    const response = await waitUntilReady("http://localhost:8788/");
    const text = await response.text();
    expect(text).toContain("Welcome to Remix");
  });
});
