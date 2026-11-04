import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "vitest";
import { createBuildApp } from "../build";
import type { WorkersResolvedConfig } from "../plugin-config";
import type * as vite from "vite";

let root: string | undefined;

afterEach(() => {
	if (root) {
		fs.rmSync(root, { recursive: true, force: true });
		root = undefined;
	}
});

interface FakeEnvironmentOptions {
	isBuilt?: boolean;
	hasEntry?: boolean;
}

function makeEnvironment(
	name: string,
	{ isBuilt = false, hasEntry = false }: FakeEnvironmentOptions = {}
): vite.BuildEnvironment {
	return {
		name,
		isBuilt,
		config: {
			build: {
				outDir: path.join("dist", name),
				rollupOptions: hasEntry ? { input: "index.html" } : {},
			},
		},
	} as unknown as vite.BuildEnvironment;
}

function makeBuilder(environments: Record<string, vite.BuildEnvironment>): {
	builder: vite.ViteBuilder;
	builtEnvironments: string[];
} {
	const builtEnvironments: string[] = [];
	const builder = {
		environments,
		config: {
			root: root,
			publicDir: undefined,
			logger: { info: () => {} },
		},
		async build(environment: vite.BuildEnvironment) {
			builtEnvironments.push(environment.name);
			environment.isBuilt = true;
		},
	} as unknown as vite.ViteBuilder;

	return { builder, builtEnvironments };
}

function makeResolvedConfig(): WorkersResolvedConfig {
	return {
		type: "workers",
		entryWorkerEnvironmentName: "ssr",
		environmentNameToWorkerMap: new Map([["ssr", { devOnly: undefined }]]),
		environmentNameToChildEnvironmentNamesMap: new Map(),
		prerenderWorkerEnvironmentName: undefined,
	} as unknown as WorkersResolvedConfig;
}

async function runBuildApp(
	environments: Record<string, vite.BuildEnvironment>
): Promise<string[]> {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-build-"));

	// The `ssr` Worker build must have already produced its Vite manifest for
	// `createBuildApp` to read imported asset paths from it
	const ssrOutDir = path.resolve(
		root,
		environments.ssr.config.build.outDir
	);
	fs.mkdirSync(path.join(ssrOutDir, ".vite"), { recursive: true });
	fs.writeFileSync(
		path.join(ssrOutDir, ".vite", "manifest.json"),
		JSON.stringify({ "src/index.js": { file: "index.js" } })
	);

	const { builder, builtEnvironments } = makeBuilder(environments);
	await createBuildApp(makeResolvedConfig())(builder);

	return builtEnvironments;
}

describe("createBuildApp", () => {
	it("builds the Worker and client environments when none has been built yet", async ({
		expect,
	}) => {
		const builtEnvironments = await runBuildApp({
			ssr: makeEnvironment("ssr"),
			client: makeEnvironment("client", { hasEntry: true }),
		});

		expect(builtEnvironments).toEqual(["ssr", "client"]);
	});

	it("does not rebuild the client environment when another plugin's buildApp already built it", async ({
		expect,
	}) => {
		const builtEnvironments = await runBuildApp({
			ssr: makeEnvironment("ssr"),
			client: makeEnvironment("client", { hasEntry: true, isBuilt: true }),
		});

		expect(builtEnvironments).toEqual(["ssr"]);
	});

	it("does not rebuild a Worker environment when another plugin's buildApp already built it", async ({
		expect,
	}) => {
		const builtEnvironments = await runBuildApp({
			ssr: makeEnvironment("ssr", { isBuilt: true }),
			client: makeEnvironment("client", { hasEntry: true }),
		});

		expect(builtEnvironments).toEqual(["client"]);
	});
});
