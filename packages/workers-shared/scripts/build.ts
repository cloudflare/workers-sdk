import { execFileSync } from "child_process";
import { rmSync } from "fs";
import path from "path";
import * as esbuild from "esbuild";

function resolve(...segments: string[]) {
	return path.resolve(__dirname, "..", ...segments);
}

async function main() {
	try {
		rmSync(resolve("dist"), { recursive: true });
	} catch {}

	console.log("Building asset-worker...");
	await esbuild.build({
		entryPoints: ["asset-worker/src/**/*"],
		format: "esm",
		bundle: true,
		sourcemap: "external",
		external: ["cloudflare:*", "node:*"],
		outdir: resolve("dist/asset-worker/src"),
	});

	console.log("Building router-worker...");
	await esbuild.build({
		entryPoints: ["router-worker/src/**/*"],
		format: "esm",
		bundle: true,
		sourcemap: "external",
		external: ["cloudflare:*", "node:*"],
		outdir: resolve("dist/router-worker/src"),
	});

	console.log("Building utils...");
	await esbuild.build({
		entryPoints: ["utils/**/*"],
		format: "esm",
		bundle: true,
		sourcemap: "external",
		external: ["cloudflare:*", "node:*"],
		outdir: resolve("dist/utils"),
	});

	console.log("Generating types...");
	execFileSync(
		"tsc",
		[
			"index.ts",
			"--declaration",
			"--declarationMap",
			"--emitDeclarationOnly",
			"--declarationDir",
			"dist",
			"--target",
			"esnext",
			"--moduleResolution",
			"nodenext",
			"--module",
			"nodenext",
		],
		{
			stdio: "inherit",
			shell: true,
		}
	);

	console.log("\n✅ Build completed.");
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
