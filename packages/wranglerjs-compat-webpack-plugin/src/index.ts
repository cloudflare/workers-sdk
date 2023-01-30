/*
 * This is a webpack plugin that aims to recreate the functionality of
 * Wrangler 1's `type = wepback` setting for workers projects.
 *
 * It's kind of gross, and not good for _new_ projects, but it should work ok at
 * getting people using Wrangler 1 with the inbuilt webpack 4 support migrated
 * over to Wrangler 2. Combined with docs on ejecting webpack, the pain of
 * losing 1's (tenuous at best) webpack support should be mostly mitigated.
 *
 * This plugin attempts to replicate Wrangler 1's behavior 1:1 (specifically,
 * https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/mod.rs#L39-L58)
 * so it:
 *
 * - figures out where the actual worker is located, and saves that location as "package_dir" (https://github.com/cloudflare/wrangler/blob/master/src/settings/toml/target.rs#L40-L50)
 *   - if it's a sites project (https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/mod.rs#L161-L163)
 *     - generates a worker if necessary (https://github.com/cloudflare/wrangler/blob/master/src/settings/toml/site.rs#L42-L56)
 *   - runs `npm install` (https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/mod.rs#L165)
 *   - use the "main" file of {package_dir} as the entry if none is specified (https://github.com/cloudflare/wrangler/blob/master/src/upload/package.rs#L16-L27)
 * - runs wranglerjs-equivalent webpack hooks that: (https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/mod.rs#L44)
 *   - assert `target` is `webworker` (https://github.com/cloudflare/wrangler/blob/master/wranglerjs/index.js#L52-L60)
 *   - assert `output.filename` is `worker.js` and `output.sourceMapFilename` is `worker.map.js` (https://github.com/cloudflare/wrangler/blob/master/wranglerjs/index.js#L62-L92)
 *   - bundle all emitted JS into a single file (https://github.com/cloudflare/wrangler/blob/master/wranglerjs/index.js#L118-L121)
 * - takes webpack output and writes it to disk (https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/mod.rs#L144)
 *   - at `{package_dir}/worker` (https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/bundle.rs#L35-L37)
 *   - if there's WASM, adds some hardcoded js to import it (https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/bundle.rs#L47-L64)
 */

import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import rimraf from "rimraf";
import { readConfig } from "wrangler/src/config";

import type {
	Compiler,
	Configuration as WebpackConfig,
	compilation as _compilation,
} from "webpack";
import type { Config as WranglerConfig } from "wrangler/src/config";
type Compilation = _compilation.Compilation;

const PLUGIN_NAME = "WranglerJsCompatWebpackPlugin";
const WASM_IMPORT = `
WebAssembly.instantiateStreaming =
    async function instantiateStreaming(req, importObject) {
  const module = WASM_MODULE;
  return {
    module,
    instance: new WebAssembly.Instance(module, importObject)
  }
};
`;

export type WranglerJsCompatWebpackPluginArgs = {
	/**
	 * Path to your wrangler configuration file (wrangler.toml).
	 * If omitted, an effort is made to find your file.
	 */
	pathToWranglerToml?: string;
	/**
	 * Specify an environment from your configuration file to build.
	 * If omitted, the top-level configuration is used.
	 */
	environment?: string;
};

export class WranglerJsCompatWebpackPlugin {
	private readonly config: WranglerConfig;
	private packageDir!: string; // set by this.setPackageDir
	private output?: {
		js: string;
		wasm?: Buffer;
	};

	constructor({
		pathToWranglerToml,
		environment,
	}: WranglerJsCompatWebpackPluginArgs = {}) {
		this.config = readConfig(pathToWranglerToml, {
			env: environment,
			"legacy-env": true,
			experimentalJsonConfig: false,
			v: undefined,
			config: undefined,
		});
	}

	apply(compiler: Compiler): void {
		// figure out where the actual worker is located, and save that location as this.packageDir
		compiler.hooks.entryOption.tap(PLUGIN_NAME, this.setPackageDir.bind(this));

		// assert:
		// - `target` is`webworker`
		// - `output.filename` is `worker.js`
		// - `output.sourceMapFilename` is`worker.map.js` if it exists
		compiler.hooks.afterPlugins.tap(PLUGIN_NAME, this.checkOutputs.bind(this));

		// if it's a sites project, generate a worker if necessary.
		// run `npm install` in this.packageDir
		compiler.hooks.beforeRun.tapPromise(
			PLUGIN_NAME,
			this.setupBuild.bind(this)
		);

		// bundle all emitted JS into a single file
		compiler.hooks.shouldEmit.tap(PLUGIN_NAME, this.bundleAssets.bind(this));
	}

	/**
	 * Emulates behavior from [`Target::package_dir`](https://github.com/cloudflare/wrangler/blob/master/src/settings/toml/target.rs#L40-L50).
	 *
	 * We encourage the user to specify the "context" and "entry" explicitly in
	 * their webpack config, since wrangler 1 kind of inferred that stuff but
	 * wrangler 2 is very hands-off for custom builds.
	 *
	 * This has to be a synchronous function that only returns something
	 * if it encounters an error. In webpack 4 `entryOption` is a
	 * [`SyncBailHook`](https://github.com/webpack/tapable#hook-types)
	 * ([docs](https://v4.webpack.js.org/api/compiler-hooks/#entryoption)).
	 *
	 * Docs on `context` and `entry` are [here](https://v4.webpack.js.org/configuration/entry-context/).
	 *
	 * @param context The base directory, an absolute path, for resolving entry points and loaders from configuration.
	 * @param entry The point or points where to start the application bundling process.
	 */
	private setPackageDir(
		context: WebpackConfig["context"],
		entry: WebpackConfig["entry"]
	) {
		if (context === undefined || entry === undefined) {
			const weWouldGuess =
				"With `type = webpack`, wrangler 1 would try to guess where your worker lives.";
			const noLonger =
				"Now that you're running webpack outside of wrangler, you need to specify this explicitly.";
			const docsUrl = "https://v4.webpack.js.org/configuration/entry-context/";
			console.warn(`${weWouldGuess}\n${noLonger}\n${docsUrl}`);
		}

		if (entry === undefined) {
			console.warn(
				'You should set the `entry` key in your webpack config to be the entry point for you worker (e.g. "index.js")'
			);
		}

		if (this.config.site) {
			this.packageDir = path.resolve(
				this.config.site["entry-point"] || "workers-site"
			);
		} else {
			this.packageDir = process.cwd();
		}
	}

	/**
	 * Mimics wrangler-js' [assertions for build output](https://github.com/cloudflare/wrangler/blob/master/wranglerjs/index.js#L52-L92)
	 */
	private checkOutputs(compiler: Compiler) {
		if (compiler.options.target !== "webworker") {
			console.warn('Setting `target` to "webworker"...');

			compiler.options.target = "webworker";
		}
	}

	/**
	 * Partially equivalent to [`setup_build`](https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/mod.rs#L154-L210)
	 * in wrangler 1, with the notable exception of preparing to run webpack
	 * since we now have the user do that.
	 */
	private async setupBuild() {
		if (this.config.site !== undefined) {
			await this.scaffoldSitesWorker();
		}

		if (!fs.existsSync(path.join(this.packageDir, "node_modules"))) {
			console.warn(`Running \`npm install\` in ${this.packageDir}...`);
			child_process.spawnSync("npm", ["install"], {
				cwd: this.packageDir,
			});
		}
	}

	/**
	 * Generate a sites-worker if one doesn't exist already.
	 * equivalent to [`Site::scaffold_worker`](https://github.com/cloudflare/wrangler/blob/master/src/settings/toml/site.rs#L42-L56)
	 * in wrangler 1.
	 */
	private async scaffoldSitesWorker() {
		if (fs.existsSync(this.packageDir)) {
			return;
		}

		const warning = `We're going to clone a simple worker into ${this.packageDir} for you since we detected a sites project with no worker component. To hide this warning, you should include the worker before building.`;
		const heresTheTemplate = `You can clone the worker into ${this.packageDir} yourself:`;
		const template = "https://github.com/cloudflare/worker-sites-init";

		console.warn(`${warning}\n${heresTheTemplate}\n${template}`);

		child_process.spawnSync("git", [
			"clone",
			"--depth",
			"1",
			template,
			this.packageDir,
		]);
		await rm(path.resolve(this.packageDir, ".git"));
	}

	private bundleAssets({ assets }: Compilation) {
		const jsAssets = getAssetsWithExtension(assets, "js");

		if (jsAssets.length > 1) {
			console.warn(
				"Webpack emitted multiple javascript files. We'll combine them for you, but you should configure webpack to emit exactly one."
			);
		}

		// https://github.com/cloudflare/wrangler/blob/master/wranglerjs/index.js#L118-L121
		this.output = {
			js: jsAssets.reduce((acc: string, k) => {
				const asset = assets[k];
				return acc + asset.source();
			}, ""),
		};

		const wasmAssets = getAssetsWithExtension(assets, "wasm");
		if (wasmAssets.length > 0) {
			this.output.wasm = assets[wasmAssets[0]];
		}

		this.writeOutput();

		return false;
	}

	/**
	 * Mimics [`Bundle::write`](https://github.com/cloudflare/wrangler/blob/master/src/wranglerjs/bundle.rs#L34-L68)
	 */
	private writeOutput() {
		if (!this.output) {
			throw new Error("This should only be called after bundling assets.");
		}

		fs.mkdirSync(path.join(this.packageDir, "worker"), { recursive: true });
		if (this.output.wasm) {
			fs.writeFileSync(
				path.join(this.packageDir, "worker", "module.wasm"),
				this.output.wasm
			);
			this.output.js = `${WASM_IMPORT}\n${this.output.js}`;
		}

		fs.writeFileSync(
			path.join(this.packageDir, "worker", "script.js"),
			this.output.js
		);
	}
}

/**
 * Promise wrapper around rimraf
 */
function rm(
	pathToRemove: string,
	options?: rimraf.Options
): Promise<null | undefined> {
	return new Promise((resolve, reject) => {
		const callback = (result: Error | null | undefined) => {
			if (result instanceof Error) {
				reject(result);
			} else {
				resolve(result);
			}
		};
		options !== undefined
			? rimraf(pathToRemove, options, callback)
			: rimraf(pathToRemove, callback);
	});
}

/**
 * Gets all assets with a given extension
 */
function getAssetsWithExtension(assets: object, extension: string) {
	const regex = new RegExp(`\\.${extension}$`);
	return Object.keys(assets).filter((filename) => regex.test(filename));
}

export default WranglerJsCompatWebpackPlugin;
