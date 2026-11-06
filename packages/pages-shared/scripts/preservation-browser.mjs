// Start a disposable local workerd instance; no account or deployment credentials.
import { build } from "esbuild";
import { Miniflare } from "miniflare";

const {
	outputFiles: [worker],
} = await build({
	entryPoints: [
		new URL(
			"../__tests__/asset-server/fixtures/preservation-worker.js",
			import.meta.url
		).pathname,
	],
	write: false,
	bundle: true,
	format: "esm",
});
const runtime = new Miniflare({
	workers: [
		{
			config: {
				name: "preservation-probe",
				compatibilityDate: "2025-01-01",
				manifest: {
					mainModule: "index.mjs",
					modulesRoot: process.cwd(),
					modules: { "index.mjs": { type: "esm", contents: worker.text } },
				},
			},
		},
	],
	host: "127.0.0.1",
	port: 8793,
});
console.log(`SPA probe: ${await runtime.ready}`);
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, async () => {
		await runtime.dispose();
		process.exit(0);
	});
}
