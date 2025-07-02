import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] static routing", () => {
	describe("static routing behavior", () => {
		let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
				"--port=0",
				"--inspector-port=0",
			]));
		});

		afterAll(async () => {
			await stop?.();
		});

		it("should serve assets when they exist for a path", async ({ expect }) => {
			let response = await fetch(`http://${ip}:${port}/static/page`);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain(`<h1>A normal asset</h1>`);
		});

		it("should run the worker when no assets exist for a path", async ({
			expect,
		}) => {
			let response = await fetch(`http://${ip}:${port}/`);
			expect(response.status).toBe(404);
			expect(await response.text()).toContain(`404 from the User Worker`);
		});

		it("should run the worker when a positive run_worker_first rule matches", async ({
			expect,
		}) => {
			let response = await fetch(`http://${ip}:${port}/worker/worker-runs`);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain(
				`<h1>Hello, I'm an asset (and was intercepted by the User Worker) at /worker/worker-runs.html!</h1>`
			);
		});

		it("should serve an asset when a negative run_worker_first rule matches", async ({
			expect,
		}) => {
			let response = await fetch(`http://${ip}:${port}/missing-asset`);
			expect(response.status).toBe(404);
			expect(await response.text()).toEqual("");
		});

		it("should serve an asset when both a positive and negative (asset) run_worker_first matches", async ({
			expect,
		}) => {
			let response = await fetch(`http://${ip}:${port}/worker/asset`);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain(`<h1>Hello, I'm an asset!</h1>`);
		});
	});

	describe("static routing + SPA behavior", async () => {
		let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
				"-c=spa.wrangler.jsonc",
				"--port=0",
				"--inspector-port=0",
			]));
		});

		afterAll(async () => {
			await stop?.();
		});

		describe("browser navigation", () => {
			it("renders the root with index.html", async ({ expect }) => {
				const response = await fetch(`http://${ip}:${port}`, {
					headers: {
						"X-MF-Sec-Fetch-Mode": "navigate",
					},
				});
				const text = await response.text();
				expect(text).toMatchInlineSnapshot(`
					"<!doctype html>
					<html>
						<head>
							<title>I'm an index.html for a SPA</title>
						</head>
						<body>
							<h1>Here I am, at <span id="client-rendered">/</span>!</h1>
						</body>
						<script>
							const path = window.location.pathname;
							const updateme = document.getElementById("client-rendered");
							updateme.innerText = path;
						</script>
					</html>
					"
				`);
			});

			it("renders another path with index.html", async ({ expect }) => {
				const response = await fetch(`http://${ip}:${port}/some/page`, {
					headers: {
						"X-MF-Sec-Fetch-Mode": "navigate",
					},
				});
				const text = await response.text();
				expect(text).toMatchInlineSnapshot(`
					"<!doctype html>
					<html>
						<head>
							<title>I'm an index.html for a SPA</title>
						</head>
						<body>
							<h1>Here I am, at <span id="client-rendered">/</span>!</h1>
						</body>
						<script>
							const path = window.location.pathname;
							const updateme = document.getElementById("client-rendered");
							updateme.innerText = path;
						</script>
					</html>
					"
				`);
			});

			it("renders an include path with the User worker", async ({ expect }) => {
				const response = await fetch(`http://${ip}:${port}/api/route`, {
					headers: {
						"X-MF-Sec-Fetch-Mode": "navigate",
					},
				});
				const text = await response.text();
				expect(text).toMatchInlineSnapshot(`"{"some":["json","response"]}"`);
			});

			it("renders an exclude path with index.html", async ({ expect }) => {
				const response = await fetch(`http://${ip}:${port}/api/asset`, {
					headers: {
						"X-MF-Sec-Fetch-Mode": "navigate",
					},
				});
				const text = await response.text();
				expect(text).toMatchInlineSnapshot(`
					"<!doctype html>
					<html>
						<head>
							<title>I'm an index.html for a SPA</title>
						</head>
						<body>
							<h1>Here I am, at <span id="client-rendered">/</span>!</h1>
						</body>
						<script>
							const path = window.location.pathname;
							const updateme = document.getElementById("client-rendered");
							updateme.innerText = path;
						</script>
					</html>
					"
				`);
			});
		});

		describe("non-browser navigation", () => {
			it("renders the root with index.html", async ({ expect }) => {
				let response = await fetch(`http://${ip}:${port}`);
				expect(response.status).toBe(200);
				expect(await response.text()).toContain(`I'm an index.html for a SPA`);
			});

			it("renders another path with index.html", async ({ expect }) => {
				let response = await fetch(`http://${ip}:${port}/some/page`);
				expect(response.status).toBe(200);
				expect(await response.text()).toContain(`I'm an index.html for a SPA`);
			});

			it("renders an include path with the User worker", async ({ expect }) => {
				let response = await fetch(`http://${ip}:${port}/api/route`);
				expect(response.status).toBe(200);
				expect(response.headers.get("content-type")).toEqual(
					"application/json"
				);
				expect(await response.text()).toContain(`{"some":["json","response"]}`);
			});

			it("renders an exclude path with index.html", async ({ expect }) => {
				let response = await fetch(`http://${ip}:${port}/api/asset`);
				expect(response.status).toBe(200);
				expect(await response.text()).toContain(`I'm an index.html for a SPA`);
			});
		});
	});
});
