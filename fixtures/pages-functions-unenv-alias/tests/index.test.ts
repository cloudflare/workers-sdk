import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages functions with unenv aliased packages", () => {
    it("should run dev server when importing 2 unenv aliased packages", async ({ expect, onTestFinished }) => {
        const { ip, port, stop } = await runWranglerPagesDev(
            resolve(__dirname, ".."),
            "./functions",
            ["--port=0", "--inspector-port=0"]
        );
        onTestFinished(stop);
        const response = await fetch(`http://${ip}:${port}/`);
        const body = await response.text();
        expect(body).toMatchInlineSnapshot(`"OK!"`);
    });
});
