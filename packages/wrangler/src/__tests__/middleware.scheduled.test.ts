import * as fs from "node:fs";
import { unstable_dev } from "../api";
import { unsetAllMocks } from "./helpers/mock-cfetch";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";

jest.unmock("undici");

describe("run scheduled events with middleware (module workers)", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		unsetAllMocks();
	});

	it("should not intercept when middleware is not enabled", async () => {
		const scriptContent = `
    export default {
      fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === "/__scheduled") {
          return new Response("Fetch triggered at /__scheduled");
        }
        return new Response("Hello world!");
      },
      scheduled(controller, env, ctx) {
        console.log("Doing something scheduled in modules...");
      },
    };
    `;
		fs.writeFileSync("index.js", scriptContent);

		const worker = await unstable_dev(
			"index.js",
			{},
			{ disableExperimentalWarning: true }
		);

		const resp = await worker.fetch("/__scheduled");
		let text;
		if (resp) text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"Fetch triggered at /__scheduled"`);
		await worker.stop();
	});

	it("should intercept when middleware is enabled", async () => {
		const scriptContent = `
    export default {
      fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === "/__scheduled") {
          return new Response("Fetch triggered at /__scheduled");
        }
        return new Response("Hello world!");
      },
      scheduled(controller, env, ctx) {
        console.log("Doing something scheduled in modules...");
      },
    };
    `;
		fs.writeFileSync("index.js", scriptContent);

		const worker = await unstable_dev(
			"index.js",
			{ testScheduled: true },
			{ disableExperimentalWarning: true }
		);

		const resp = await worker.fetch("/__scheduled");
		let text;
		if (resp) text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"Ran scheduled event"`);
		await worker.stop();
	});
});
