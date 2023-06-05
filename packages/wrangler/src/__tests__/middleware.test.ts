import * as fs from "node:fs";
import { unstable_dev } from "../api";
import { runInTempDir } from "./helpers/run-in-tmp";

jest.unmock("child_process");
jest.unmock("undici");

describe("multiple middleware", () => {
	runInTempDir();
	it("should respond correctly with D1 databases, scheduled testing, and formatted dev errors", async () => {
		// Kitchen sink test to check interaction between multiple middlewares
		const scriptContent = `
			export default {
				async fetch(request, env, ctx) {
					const { pathname } = new URL(request.url);
					if (pathname === "/setup") {
						await env.DB.exec("CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT);");
						return new Response(null, { status: 204 });
					} else if (pathname === "/query") {
      			const rows = await env.DB.prepare("SELECT * FROM test;").all();
      			return Response.json(rows.results);
					}
					throw new Error("Not found!");
			  },
			  async scheduled(controller, env, ctx) {
					const stmt = await env.DB.prepare("INSERT INTO test (id, value) VALUES (?, ?)");
					await stmt.bind(1, "one").run();
			  }
			}
		`;
		fs.writeFileSync("index.js", scriptContent);

		const worker = await unstable_dev("index.js", {
			experimental: {
				disableExperimentalWarning: true,
				disableDevRegistry: true,
				testScheduled: true,
				d1Databases: [
					{
						binding: "DB",
						database_name: "db",
						database_id: "00000000-0000-0000-0000-000000000000",
					},
				],
			},
		});

		try {
			let res = await worker.fetch("http://localhost/setup");
			expect(res.status).toBe(204);

			res = await worker.fetch("http://localhost/__scheduled");
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("Ran scheduled event");

			res = await worker.fetch("http://localhost/query");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual([{ id: 1, value: "one" }]);

			res = await worker.fetch("http://localhost/bad");
			expect(res.status).toBe(500);
			expect(res.headers.get("Content-Type")).toBe("text/html; charset=UTF-8");
			expect(await res.text()).toContain("Not found!");
		} finally {
			await worker.stop();
		}
	});
});
