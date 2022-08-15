import { watch } from "chokidar";
import { getEntry } from "../entry";
import { getHostFromRoute, getZoneForRoute, getZoneIdFromHost } from "../zones";
import { command, session } from "./command";
import { LogEvent, MetricsEvent, TypedEvent, TypedEventTarget } from "./events";
import type { Route } from "../config/environment";
import type { FSWatcher } from "chokidar";
import type { Stats } from "node:fs";
import { CommandSession } from "./command/session";
import { Config, printBindings } from "../config";
import { getBindings } from "../dev";
import { getAssetPaths, getSiteAssetPaths } from "../sites";

export type Args = {
	/** The path to an entry point for your worker. */
	script: string;

	/** Enable node.js compatibility. */
	nodeCompat?: boolean;

	/**
	 * Host to forward requests to, defaults to the zone of project. */
	host?: string;

	/** Routes to upload. */
	routes?: Route[];

	/** Run on my machine. */
	local?: boolean;

	/** Resources to bind to this Worker. */
	bindings?: Bindings;

	/**
	 * Watch the filesystem for changes and reload automatically when a change
	 * is detected.
	 *
	 * Accepts a path or array of paths to watch, or
	 * `true` which will do its best to figure out what to watch.
	 */
	watch?: boolean | string[];
} & (AssetsArgs | SitesArgs);

type Bindings = {
	/** KV Namespaces you want to access from inside your Worker. */
	kvNamespaces?: {
		/** The binding name used to refer to the KV Namespace */
		binding: string;
		/** The ID of the KV namespace used during `wrangler dev` */
		id: string;
	};

	/** A map of environment variables to set when deploying your worker. */
	vars?: {
		[key: string]: {
			/** The value of the environment variable */
			value: unknown;

			/** Whether the value should be hidden from logs. */
			hidden?: true;
		};
	};

	/**
	 * A list of wasm modules that your worker should be bound to.
	 *
	 * This is the "legacy" way of binding to a wasm module.
	 * ES module workers should do proper module imports.
	 */
	wasmModules?: Record<string, string>;

	/**
	 * A list of text files that your worker should be bound to.
	 *
	 * This is the "legacy" way of binding to a text file.
	 * ES module workers should do proper module imports.
	 */
	textBlobs?: Record<string, string>;

	/**
	 * A list of data files that your worker should be bound to.
	 *
	 * This is the "legacy" way of binding to a data file.
	 * ES module workers should do proper module imports.
	 */
	dataBlobs?: Record<string, string>;

	/**
	 * A list of durable objects that your worker should be bound to.
	 *
	 * For more information about Durable Objects, see the documentation at
	 * https://developers.cloudflare.com/workers/learning/using-durable-objects
	 */
	durableObjects?: {
		/** The name of the binding used to refer to the Durable Object */
		name: string;

		/** The exported class name of the Durable Object */
		className: string;

		/** The script where the Durable Object is defined (if it's external to this worker) */
		scriptName?: string;

		/** The service environment of the `scriptName` to bind to */
		environment?: string;
	}[];

	/** R2 buckets that are bound to this Worker. */
	r2Buckets?: {
		/** The preview name of this R2 bucket at the edge. */
		name: string;

		/** The binding name used to refer to the R2 bucket in the worker. */
		binding: string;
	}[];

	/** Specifies namespace bindings that are bound to this Worker environment. */
	workerNamespaces?: Config["worker_namespaces"];

	/** Service bindings (worker-to-worker) to bind to this `dev` session. */
	services?: Exclude<Config["services"], undefined>;

	/** "Unsafe" tables for features that aren't directly supported by wrangler. */
	unsafe?: Exclude<Config["unsafe"], undefined>["bindings"];

	/**
	 * Specify a compiled capnp schema to use
	 *
	 * Then add a binding per field in the top level message that you will send to logfwdr
	 */
	logfwdr?: Config["logfwdr"];
};

type AssetsArgs = {
	/**
	 * Serve a folder of static assets with your Worker, without any additional code.
	 *
	 * This can either be a `string`, or an object with additional config fields.
	 *
	 * A `string` is equivalent to specifying only the bucket.
	 */
	assets?:
		| string
		| {
				/** The folder to serve assets from */
				bucket: string;

				/**
				 * An exclusive list of .gitignore-style patterns that match file
				 * or directory names from your bucket location. Only matched
				 * items will be uploaded. Example: include = ["upload_dir"]
				 */
				include?: string[];

				/**
				 * A list of .gitignore-style patterns that match files or
				 * directories in your bucket that should be excluded from
				 * uploads. Example: exclude = ["ignore_dir"]
				 */
				exclude?: string[];

				/** Specifies a TTL for the browser. */
				browserTTL?: number;

				/** Whether or not to serve the assets as a SPA. */
				serveSinglePageApp?: boolean;
		  };

	site: never;
};

type SitesArgs = {
	/**
	 * Root folder of static assets for Workers Sites.
	 *
	 * This can either be a `string`, or an object with additional config fields.
	 *
	 * A `string` is equivalent to specifying only the bucket.
	 */
	site?:
		| string
		| {
				/**
				 * The directory containing your static assets.
				 *
				 * It must be a path relative to your wrangler.toml file.
				 * Example: bucket = "./public"
				 *
				 * If there is a `site` field then it must contain this `bucket` field.
				 */
				bucket: string;

				/**
				 * An exclusive list of .gitignore-style patterns that match file
				 * or directory names from your bucket location. Only matched
				 * items will be uploaded. Example: include = ["upload_dir"]
				 */
				include?: string[];

				/**
				 * A list of .gitignore-style patterns that match files or
				 * directories in your bucket that should be excluded from
				 * uploads. Example: exclude = ["ignore_dir"]
				 */
				exclude?: string[];
		  };

	assets: never;
};

class DevSession extends CommandSession<
	FileChangedEvent | LogEvent | MetricsEvent
> {
	private args: Args;

	constructor(args: Args) {
		super();
		this.args = args;
	}

	initialize(): Promise<void> {
		throw new Error("Method not implemented.");
	}

	dispose(): Promise<void> {
		throw new Error("Method not implemented.");
	}
}

class FileChangedEvent extends TypedEvent<"file-changed"> {
	path: string;
	stats?: Stats;

	constructor({ path, stats }: { path: string; stats?: Stats }) {
		super("file-changed");
		this.path = path;
		this.stats = stats;
	}
}
