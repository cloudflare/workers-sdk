import * as fs from "node:fs";
import { getContainerDir } from "@cloudflare/build-output-utils";
import { buildAndWriteContainerOutput } from "@cloudflare/containers-shared";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder } from "vite";
import { beforeEach, test, vi } from "vitest";
import { cloudflare } from "../index";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal()),
	buildAndWriteContainerOutput: vi.fn(),
}));

runInTempDir();

beforeEach(() => {
	vi.mocked(buildAndWriteContainerOutput).mockClear();
	fs.writeFileSync(
		"cloudflare.config.ts",
		`export default { worker: {
			name: "build-output-containers",
			entrypoint: "./worker.ts",
			compatibilityDate: "2024-12-30",
		} };`
	);
	fs.writeFileSync(
		"worker.ts",
		`export default { fetch() { return new Response("ok"); } };`
	);
});

async function buildFixture() {
	const builder = await createBuilder(
		{
			root: process.cwd(),
			configFile: false,
			logLevel: "silent",
			plugins: [cloudflare({ types: { generate: false } })],
		},
		null
	);
	await builder.buildApp();
}

test("reports that the previous output had no Containers so the build does not look up stale image tags", async ({
	expect,
}) => {
	await buildFixture();

	expect(buildAndWriteContainerOutput).toHaveBeenCalledOnce();
	expect(buildAndWriteContainerOutput).toHaveBeenCalledWith(
		expect.objectContaining({
			containers: [],
			previousOutputHadContainers: false,
		})
	);
});

test("reports Container output left by a previous build before cleaning it", async ({
	expect,
}) => {
	const previousContainerDir = getContainerDir(process.cwd(), "old-api");
	fs.mkdirSync(previousContainerDir, { recursive: true });

	await buildFixture();

	expect(fs.existsSync(previousContainerDir)).toBe(false);
	expect(buildAndWriteContainerOutput).toHaveBeenCalledOnce();
	expect(buildAndWriteContainerOutput).toHaveBeenCalledWith(
		expect.objectContaining({
			containers: [],
			previousOutputHadContainers: true,
		})
	);
});
