import addModule from "./add.wasm";

const addInstance = new WebAssembly.Instance(addModule);
const add = addInstance.exports.add as (a: number, b: number) => number;

export default (<ExportedHandler>{
	fetch(request, env, ctx) {
		const url = new URL(request.url);
		const a = parseInt(url.searchParams.get("a") ?? "0");
		const b = parseInt(url.searchParams.get("b") ?? "0");
		const result = add(a, b);
		return new Response(result.toString());
	},
});
