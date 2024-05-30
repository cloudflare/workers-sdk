import { Message } from "capnp-ts";
import { Miniflare } from "miniflare";
import { StructureGroups } from "./rtti.capnp.js";

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
root.getGroups().forEach((group) => {
	group.getStructures().forEach((structure) => {
		structures.set(structure.getFullyQualifiedName(), structure);
	});
});

// Get built-in modules list
const builtinModuleNames = new Set();
root.getModules().forEach((module) => {
	builtinModuleNames.add(module.getSpecifier());
});
// TODO(soon): remove this line once `exportTypes()` supports compatibility
//  flags that require `--experimental` (e.g. "unsafe_module")
builtinModuleNames.add("workerd:unsafe");
/** @type {string[]} */
export const builtinModules = Array.from(builtinModuleNames);
