import assert from "node:assert";
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

// Get `ExportedHandler` property names
const exportedHandler = structures.get("workerd::api::ExportedHandler");
assert(exportedHandler !== undefined, "Expected to find ExportedHandler types");
const exportedHandlerNames = new Set();
// Add names from the C++ type
exportedHandler.getMembers().forEach((member) => {
	if (!member.isProperty()) return;
	const property = member.getProperty();
	if (property.getType().isJsgImpl()) return;
	exportedHandlerNames.add(property.getName());
});
// Add names from the TypeScript override. This will catch things like `email`
// and `queue` which are "custom events" defined dynamically.
for (const match of exportedHandler.getTsOverride().matchAll(/([a-z]+)\?:/g)) {
	exportedHandlerNames.add(match[1]);
}
/** @type {string[]} */
export const exportedHandlers = Array.from(exportedHandlerNames);

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
