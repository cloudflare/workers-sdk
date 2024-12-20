const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started");
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(
					`    ${location.file}:${location.line}:${location.column}:`
				);
			});
			console.log("[watch] build finished");
		});
	},
};

async function buildExtension(watch) {
	const ctx = await esbuild.context({
		entryPoints: ["src/extension.ts"],
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: "node",
		outfile: "dist/extension.js",
		external: ["vscode"],
		logLevel: "silent",
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

async function buildWranglerConfigEditor(watch) {
	const ctx = await esbuild.context({
		entryPoints: ["src/WranglerConfigEditor/index.tsx"],
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		outfile: "dist/WranglerConfigEditor.js",
		external: ["vscode"],
		logLevel: "silent",
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

async function main() {
	// Build all dependencies first
	await buildWranglerConfigEditor();

	if (!watch) {
		return buildExtension();
	}

	// Rebuild on changes
	return await Promise.all([
		buildWranglerConfigEditor(true),
		buildExtension(true),
	]);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
