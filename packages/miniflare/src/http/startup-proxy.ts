import { createRequire } from "node:module";

/** Preserve Node's startup proxy before the first Undici 8 import replaces it. */
function preserveStartupProxy() {
	const legacyKey = Symbol.for("undici.globalDispatcher.1");
	const globalKey = Symbol.for("undici.globalDispatcher.2");
	const legacy = Object.getOwnPropertyDescriptor(globalThis, legacyKey);
	if (
		Object.hasOwn(globalThis, globalKey) ||
		legacy?.value?.constructor?.name !== "EnvHttpProxyAgent"
	) {
		return;
	}

	const require = createRequire(__filename);
	const { EnvHttpProxyAgent, setGlobalDispatcher } =
		require("undici") as typeof import("undici");
	setGlobalDispatcher(new EnvHttpProxyAgent({ allowH2: false }));
	Object.defineProperty(globalThis, legacyKey, legacy);
}

preserveStartupProxy();
