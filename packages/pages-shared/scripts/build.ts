import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

function resolve(...segments: string[]) {
	return path.resolve(__dirname, "..", ...segments);
}

async function main() {
	try {
		rmSync(resolve("dist"), { recursive: true });
	} catch {}

	console.log("Building asset-server...");
	await esbuild.build({
		entryPoints: ["asset-server/**/*"],
		format: "esm",
		bundle: true,
		sourcemap: "external",
		external: ["cloudflare:*", "node:*"],
		outdir: resolve("dist/asset-server/"),
	});

	console.log("Building metadata-generator...");
	await esbuild.build({
		entryPoints: ["metadata-generator/**/*"],
		format: "esm",
		bundle: true,
		sourcemap: "external",
		external: ["cloudflare:*", "node:*"],
		outdir: resolve("dist/metadata-generator"),
	});

	console.log("Generating types...");
	execFileSync("tsc", ["-p", "tsconfig.build.json"], {
		stdio: "inherit",
		shell: true,
	});

	console.log("\n✅ Build completed.");
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
