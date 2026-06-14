import { kVoid } from "../runtime/config";
import type {
	Config,
	DiskDirectory,
	ExternalServer,
	Extension,
	HttpOptions,
	Network,
	Service,
	ServiceDesignator,
	Socket,
	Worker,
	Worker_Binding,
	Worker_DurableObjectNamespace,
	Worker_DurableObjectStorage,
	Worker_Module,
} from "../runtime/config";

/**
 * Destination for content that is too large or unsafe to inline directly into
 * the generated Cap'n Proto text (module sources, binary blobs). Implementations
 * persist the content somewhere and return a path, relative to the `.capnp` file,
 * suitable for use with Cap'n Proto's `embed` keyword.
 */
export interface EmbedSink {
	embedText(hint: string, content: string): string;
	embedBinary(hint: string, content: Uint8Array): string;
}

const INDENT = "\t";

function pad(depth: number): string {
	return INDENT.repeat(depth);
}

/**
 * Renders a Cap'n Proto struct literal. `fields` entries that are `null` are
 * omitted, so callers can conditionally include fields inline. Each value string
 * must already be rendered at `depth + 1`.
 */
function struct(depth: number, fields: Array<[string, string] | null>): string {
	const present = fields.filter(
		(field): field is [string, string] => field !== null
	);
	if (present.length === 0) {
		return "()";
	}
	const inner = pad(depth + 1);
	const body = present
		.map(([key, value]) => `${inner}${key} = ${value}`)
		.join(",\n");
	return `(\n${body}\n${pad(depth)})`;
}

function list(depth: number, items: string[]): string {
	if (items.length === 0) {
		return "[]";
	}
	const inner = pad(depth + 1);
	return `[\n${items.map((item) => `${inner}${item}`).join(",\n")}\n${pad(depth)}]`;
}

/**
 * Escapes a string into a Cap'n Proto text literal. Only the escapes the text
 * grammar guarantees are emitted; all other code points pass through as UTF-8
 * (Cap'n Proto source is UTF-8), so we never rely on `\u` support.
 */
export function capnpString(value: string): string {
	let out = '"';
	for (const char of value) {
		const code = char.codePointAt(0) ?? 0;
		if (char === '"') {
			out += '\\"';
		} else if (char === "\\") {
			out += "\\\\";
		} else if (char === "\n") {
			out += "\\n";
		} else if (char === "\r") {
			out += "\\r";
		} else if (char === "\t") {
			out += "\\t";
		} else if (code < 0x20 || code === 0x7f) {
			out += `\\x${code.toString(16).padStart(2, "0")}`;
		} else {
			out += char;
		}
	}
	return `${out}"`;
}

function emitDesignator(designator: ServiceDesignator, depth: number): string {
	const hasName = designator.name !== undefined;
	// `ServiceDesignator` accepts a bare string shorthand for the `name` field, so
	// emit the compact form whenever no other fields are set (matches workerd docs).
	if (
		hasName &&
		designator.entrypoint === undefined &&
		designator.props === undefined
	) {
		return capnpString(designator.name ?? "");
	}
	return struct(depth, [
		hasName ? ["name", capnpString(designator.name ?? "")] : null,
		designator.entrypoint !== undefined
			? ["entrypoint", capnpString(designator.entrypoint)]
			: null,
		designator.props !== undefined
			? [
					"props",
					struct(depth + 1, [["json", capnpString(designator.props.json)]]),
				]
			: null,
	]);
}

function emitHttpOptions(options: HttpOptions, depth: number): string {
	return struct(depth, [
		options.style !== undefined ? ["style", String(options.style)] : null,
		options.forwardedProtoHeader !== undefined
			? ["forwardedProtoHeader", capnpString(options.forwardedProtoHeader)]
			: null,
		options.cfBlobHeader !== undefined
			? ["cfBlobHeader", capnpString(options.cfBlobHeader)]
			: null,
		options.injectRequestHeaders !== undefined
			? [
					"injectRequestHeaders",
					list(
						depth + 1,
						options.injectRequestHeaders.map((header) =>
							struct(depth + 2, [
								header.name !== undefined
									? ["name", capnpString(header.name)]
									: null,
								header.value !== undefined
									? ["value", capnpString(header.value)]
									: null,
							])
						)
					),
				]
			: null,
	]);
}

function emitModule(
	module: Worker_Module,
	depth: number,
	sink: EmbedSink
): string {
	const name = module.name;
	const fields: Array<[string, string] | null> = [["name", capnpString(name)]];
	if ("esModule" in module && module.esModule !== undefined) {
		fields.push([
			"esModule",
			`embed ${capnpString(sink.embedText(name, module.esModule))}`,
		]);
	} else if (
		"commonJsModule" in module &&
		module.commonJsModule !== undefined
	) {
		fields.push([
			"commonJsModule",
			`embed ${capnpString(sink.embedText(name, module.commonJsModule))}`,
		]);
	} else if ("text" in module && module.text !== undefined) {
		fields.push([
			"text",
			`embed ${capnpString(sink.embedText(name, module.text))}`,
		]);
	} else if ("json" in module && module.json !== undefined) {
		fields.push([
			"json",
			`embed ${capnpString(sink.embedText(name, module.json))}`,
		]);
	} else if ("data" in module && module.data !== undefined) {
		fields.push([
			"data",
			`embed ${capnpString(sink.embedBinary(name, module.data))}`,
		]);
	} else if ("wasm" in module && module.wasm !== undefined) {
		fields.push([
			"wasm",
			`embed ${capnpString(sink.embedBinary(name, module.wasm))}`,
		]);
	} else {
		throw new Error(
			`Unsupported module type for "${name}" in standalone output (e.g. Python modules are not yet supported)`
		);
	}
	return struct(depth, fields);
}

function emitBinding(
	binding: Worker_Binding,
	depth: number,
	sink: EmbedSink
): string {
	const name = binding.name;
	const head: [string, string] | null =
		name !== undefined ? ["name", capnpString(name)] : null;
	const designatorArms = [
		"service",
		"kvNamespace",
		"r2Bucket",
		"r2Admin",
		"queue",
		"analyticsEngine",
	] as const;
	for (const arm of designatorArms) {
		if (arm in binding) {
			const value = (binding as Record<string, ServiceDesignator>)[arm];
			return struct(depth, [head, [arm, emitDesignator(value, depth + 1)]]);
		}
	}
	if ("text" in binding && binding.text !== undefined) {
		return struct(depth, [head, ["text", capnpString(binding.text)]]);
	}
	if ("json" in binding && binding.json !== undefined) {
		return struct(depth, [head, ["json", capnpString(binding.json)]]);
	}
	if ("data" in binding && binding.data !== undefined) {
		return struct(depth, [
			head,
			[
				"data",
				`embed ${capnpString(sink.embedBinary(name ?? "data", binding.data))}`,
			],
		]);
	}
	if ("wasmModule" in binding && binding.wasmModule !== undefined) {
		return struct(depth, [
			head,
			[
				"wasmModule",
				`embed ${capnpString(sink.embedBinary(name ?? "wasm", binding.wasmModule))}`,
			],
		]);
	}
	if ("fromEnvironment" in binding && binding.fromEnvironment !== undefined) {
		return struct(depth, [
			head,
			["fromEnvironment", capnpString(binding.fromEnvironment)],
		]);
	}
	if ("durableObjectNamespace" in binding && binding.durableObjectNamespace) {
		const designator = binding.durableObjectNamespace;
		return struct(depth, [
			head,
			[
				"durableObjectNamespace",
				struct(depth + 1, [
					designator.className !== undefined
						? ["className", capnpString(designator.className)]
						: null,
					designator.serviceName !== undefined
						? ["serviceName", capnpString(designator.serviceName)]
						: null,
				]),
			],
		]);
	}
	if ("wrapped" in binding && binding.wrapped !== undefined) {
		const wrapped = binding.wrapped;
		return struct(depth, [
			head,
			[
				"wrapped",
				struct(depth + 1, [
					wrapped.moduleName !== undefined
						? ["moduleName", capnpString(wrapped.moduleName)]
						: null,
					wrapped.entrypoint !== undefined
						? ["entrypoint", capnpString(wrapped.entrypoint)]
						: null,
					wrapped.innerBindings !== undefined
						? [
								"innerBindings",
								list(
									depth + 2,
									wrapped.innerBindings.map((inner) =>
										emitBinding(inner, depth + 3, sink)
									)
								),
							]
						: null,
				]),
			],
		]);
	}
	if ("unsafeEval" in binding && binding.unsafeEval === kVoid) {
		return struct(depth, [head, ["unsafeEval", "void"]]);
	}
	throw new Error(
		`Unsupported binding "${name ?? "(unnamed)"}" in standalone output: ${Object.keys(
			binding
		)
			.filter((key) => key !== "name")
			.join(", ")}`
	);
}

function emitDurableObjectNamespace(
	namespace: Worker_DurableObjectNamespace,
	depth: number
): string {
	return struct(depth, [
		namespace.className !== undefined
			? ["className", capnpString(namespace.className)]
			: null,
		"uniqueKey" in namespace && namespace.uniqueKey !== undefined
			? ["uniqueKey", capnpString(namespace.uniqueKey)]
			: null,
		"ephemeralLocal" in namespace && namespace.ephemeralLocal === kVoid
			? ["ephemeralLocal", "void"]
			: null,
		namespace.preventEviction !== undefined
			? ["preventEviction", String(namespace.preventEviction)]
			: null,
		namespace.enableSql !== undefined
			? ["enableSql", String(namespace.enableSql)]
			: null,
	]);
}

function emitDurableObjectStorage(
	storage: Worker_DurableObjectStorage,
	depth: number
): string {
	if ("none" in storage && storage.none === kVoid) {
		return struct(depth, [["none", "void"]]);
	}
	if ("inMemory" in storage && storage.inMemory === kVoid) {
		return struct(depth, [["inMemory", "void"]]);
	}
	if ("localDisk" in storage && storage.localDisk !== undefined) {
		return struct(depth, [["localDisk", capnpString(storage.localDisk)]]);
	}
	throw new Error("Unsupported durableObjectStorage in standalone output");
}

function emitWorker(worker: Worker, depth: number, sink: EmbedSink): string {
	const fields: Array<[string, string] | null> = [];
	if ("modules" in worker && worker.modules !== undefined) {
		fields.push([
			"modules",
			list(
				depth + 1,
				worker.modules.map((module) => emitModule(module, depth + 2, sink))
			),
		]);
	} else if (
		"serviceWorkerScript" in worker &&
		worker.serviceWorkerScript !== undefined
	) {
		fields.push([
			"serviceWorkerScript",
			`embed ${capnpString(sink.embedText("service-worker.js", worker.serviceWorkerScript))}`,
		]);
	} else if ("inherit" in worker && worker.inherit !== undefined) {
		fields.push(["inherit", capnpString(worker.inherit)]);
	}
	if (worker.compatibilityDate !== undefined) {
		fields.push(["compatibilityDate", capnpString(worker.compatibilityDate)]);
	}
	if (worker.compatibilityFlags !== undefined) {
		fields.push([
			"compatibilityFlags",
			list(
				depth + 1,
				worker.compatibilityFlags.map((flag) => capnpString(flag))
			),
		]);
	}
	if (worker.bindings !== undefined) {
		fields.push([
			"bindings",
			list(
				depth + 1,
				worker.bindings.map((binding) => emitBinding(binding, depth + 2, sink))
			),
		]);
	}
	if (worker.globalOutbound !== undefined) {
		fields.push([
			"globalOutbound",
			emitDesignator(worker.globalOutbound, depth + 1),
		]);
	}
	if (worker.cacheApiOutbound !== undefined) {
		fields.push([
			"cacheApiOutbound",
			emitDesignator(worker.cacheApiOutbound, depth + 1),
		]);
	}
	if (worker.durableObjectNamespaces !== undefined) {
		fields.push([
			"durableObjectNamespaces",
			list(
				depth + 1,
				worker.durableObjectNamespaces.map((namespace) =>
					emitDurableObjectNamespace(namespace, depth + 2)
				)
			),
		]);
	}
	if (worker.durableObjectUniqueKeyModifier !== undefined) {
		fields.push([
			"durableObjectUniqueKeyModifier",
			capnpString(worker.durableObjectUniqueKeyModifier),
		]);
	}
	if (worker.durableObjectStorage !== undefined) {
		fields.push([
			"durableObjectStorage",
			emitDurableObjectStorage(worker.durableObjectStorage, depth + 1),
		]);
	}
	return struct(depth, fields);
}

function emitNetwork(network: Network, depth: number): string {
	return struct(depth, [
		network.allow !== undefined
			? [
					"allow",
					list(
						depth + 1,
						network.allow.map((entry) => capnpString(entry))
					),
				]
			: null,
		network.deny !== undefined
			? [
					"deny",
					list(
						depth + 1,
						network.deny.map((entry) => capnpString(entry))
					),
				]
			: null,
	]);
}

function emitDisk(disk: DiskDirectory, depth: number): string {
	return struct(depth, [
		disk.path !== undefined ? ["path", capnpString(disk.path)] : null,
		disk.writable !== undefined ? ["writable", String(disk.writable)] : null,
		disk.allowDotfiles !== undefined
			? ["allowDotfiles", String(disk.allowDotfiles)]
			: null,
	]);
}

function emitExternal(external: ExternalServer, depth: number): string {
	const fields: Array<[string, string] | null> = [
		external.address !== undefined
			? ["address", capnpString(external.address)]
			: null,
	];
	if ("http" in external && external.http !== undefined) {
		fields.push(["http", emitHttpOptions(external.http, depth + 1)]);
	} else {
		throw new Error(
			"Unsupported external service variant in standalone output (only plain http is supported)"
		);
	}
	return struct(depth, fields);
}

function emitService(service: Service, depth: number, sink: EmbedSink): string {
	const head: [string, string] | null =
		service.name !== undefined ? ["name", capnpString(service.name)] : null;
	if ("worker" in service && service.worker !== undefined) {
		return struct(depth, [
			head,
			["worker", emitWorker(service.worker, depth + 1, sink)],
		]);
	}
	if ("network" in service && service.network !== undefined) {
		return struct(depth, [
			head,
			["network", emitNetwork(service.network, depth + 1)],
		]);
	}
	if ("disk" in service && service.disk !== undefined) {
		return struct(depth, [head, ["disk", emitDisk(service.disk, depth + 1)]]);
	}
	if ("external" in service && service.external !== undefined) {
		return struct(depth, [
			head,
			["external", emitExternal(service.external, depth + 1)],
		]);
	}
	throw new Error(
		`Unsupported service "${service.name ?? "(unnamed)"}" in standalone output`
	);
}

function emitSocket(socket: Socket, depth: number): string {
	const fields: Array<[string, string] | null> = [
		socket.name !== undefined ? ["name", capnpString(socket.name)] : null,
		socket.address !== undefined
			? ["address", capnpString(socket.address)]
			: null,
		socket.service !== undefined
			? ["service", emitDesignator(socket.service, depth + 1)]
			: null,
	];
	if ("https" in socket && socket.https !== undefined) {
		throw new Error("HTTPS sockets are not supported in standalone output");
	}
	// Default to a plain HTTP socket; `http = ()` is valid and common.
	const http = "http" in socket ? socket.http : undefined;
	fields.push([
		"http",
		http !== undefined ? emitHttpOptions(http, depth + 1) : "()",
	]);
	return struct(depth, fields);
}

function emitExtension(
	extension: Extension,
	depth: number,
	sink: EmbedSink
): string {
	return struct(depth, [
		extension.modules !== undefined
			? [
					"modules",
					list(
						depth + 1,
						extension.modules.map((module) =>
							struct(depth + 2, [
								module.name !== undefined
									? ["name", capnpString(module.name)]
									: null,
								module.internal !== undefined
									? ["internal", String(module.internal)]
									: null,
								module.esModule !== undefined
									? [
											"esModule",
											`embed ${capnpString(sink.embedText(module.name ?? "extension.js", module.esModule))}`,
										]
									: null,
							])
						)
					),
				]
			: null,
	]);
}

/**
 * Renders a Miniflare-assembled {@link Config} as human-readable text Cap'n Proto
 * suitable for `workerd serve`. Module sources and binary blobs are written via
 * {@link EmbedSink} and referenced with `embed`, keeping the config readable.
 */
export function emitConfigText(config: Config, sink: EmbedSink): string {
	const fields: Array<[string, string] | null> = [];
	if (config.services !== undefined) {
		fields.push([
			"services",
			list(
				1,
				config.services.map((service) => emitService(service, 2, sink))
			),
		]);
	}
	if (config.sockets !== undefined) {
		fields.push([
			"sockets",
			list(
				1,
				config.sockets.map((socket) => emitSocket(socket, 2))
			),
		]);
	}
	if (config.extensions !== undefined && config.extensions.length > 0) {
		fields.push([
			"extensions",
			list(
				1,
				config.extensions.map((extension) => emitExtension(extension, 2, sink))
			),
		]);
	}
	if (config.v8Flags !== undefined && config.v8Flags.length > 0) {
		fields.push([
			"v8Flags",
			list(
				1,
				config.v8Flags.map((flag) => capnpString(flag))
			),
		]);
	}
	if (config.autogates !== undefined && config.autogates.length > 0) {
		fields.push([
			"autogates",
			list(
				1,
				config.autogates.map((gate) => capnpString(gate))
			),
		]);
	}
	const header = `using Workerd = import "/workerd/workerd.capnp";\n`;
	return `${header}\nconst config :Workerd.Config = ${struct(0, fields)};\n`;
}
