import { Message } from "capnp-es";
import { Miniflare } from "miniflare";
import { StructureGroups } from "./rtti.js";

export async function getBuiltinModules() {
	// Extract RTTI from `workerd`
	const mf = new Miniflare({
		compatibilityFlags: ["rtti_api"],
		modules: true,
		scriptPath: "query-worker.mjs",
		script: `
	import rtti from "workerd:rtti";
	export default {
		fetch() {
			return new Response(rtti.exportTypes("2023-12-01", ["nodejs_compat"]));
		}
	}
	`,
	});
	const res = await mf.dispatchFetch("http://localhost");
	if (!res.ok) throw new Error(await res.text());
	const buffer = await res.arrayBuffer();
	await mf.dispose();

	// Parse RTTI
	const message = new Message(buffer, /* packed */ false);

	const root = message.getRoot(StructureGroups);
	const structures = new Map();
	root.groups.forEach((group) => {
		group.structures.forEach((structure) => {
			structures.set(structure.fullyQualifiedName, structure);
		});
	});

	// Get built-in modules list
	const builtinModuleNames = new Set();
	root.modules.forEach((module) => {
		builtinModuleNames.add(module.specifier);
	});
	// TODO(soon): remove this line once `exportTypes()` supports compatibility
	//  flags that require `--experimental` (e.g. "unsafe_module")
	builtinModuleNames.add("workerd:unsafe");
	/** @type {string[]} */
	return Array.from(builtinModuleNames);
}
