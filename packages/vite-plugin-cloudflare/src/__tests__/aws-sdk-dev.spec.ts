import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { afterAll, beforeAll, test } from "vitest";

// https://github.com/cloudflare/workers-sdk/issues/14600
// AWS SDK v3 >= @aws-sdk/core 3.974 re-exports through subpath barrels
// (`@aws-sdk/core/client`), which currently resolve to `undefined` in dev.

let root: string;

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-aws-sdk-"));
	fs.mkdirSync(path.join(root, "src"));
	fs.writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({ name: "aws-sdk-fixture", private: true, type: "module" })
	);
	fs.writeFileSync(
		path.join(root, "src/index.ts"),
		`import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export default {
	async fetch() {
		const client = new DynamoDBClient({
			region: "us-east-1",
			credentials: { accessKeyId: "test", secretAccessKey: "test" },
		});
		return new Response(await client.config.region());
	},
};
`
	);
	fs.writeFileSync(
		path.join(root, "cloudflare.config.ts"),
		`import { defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2026-03-10",
		compatibilityFlags: ["nodejs_compat"],
	},
});
`
	);
	fs.writeFileSync(
		path.join(root, "vite.config.ts"),
		`import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [cloudflare({ inspectorPort: false })],
});
`
	);
	execSync("npm install --no-audit --no-fund cf@1.0.0-beta.17 @aws-sdk/client-dynamodb@3.1081.0", {
		cwd: root,
		stdio: "pipe",
	});
	// Use the locally built plugin and Vite
	fs.mkdirSync(path.join(root, "node_modules/@cloudflare"), { recursive: true });
	fs.symlinkSync(
		path.resolve(__dirname, "../.."),
		path.join(root, "node_modules/@cloudflare/vite-plugin"),
		"dir"
	);
	fs.symlinkSync(
		path.dirname(require.resolve("vite/package.json")),
		path.join(root, "node_modules/vite"),
		"dir"
	);
}, 240_000);

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

test("a Worker can construct an AWS SDK v3 client in dev", async ({
	expect,
}) => {
	const server = await createServer({
		root,
		logLevel: "silent",
		server: { port: 0, host: "127.0.0.1" },
	});
	try {
		await server.listen();
		const address = server.httpServer?.address();
		const port = typeof address === "object" && address ? address.port : 0;
		const response = await fetch(`http://127.0.0.1:${port}/`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("us-east-1");
	} finally {
		await server.close();
	}
}, 60_000);
