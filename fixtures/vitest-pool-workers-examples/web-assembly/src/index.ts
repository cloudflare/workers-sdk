import addModule from "./add.wasm";
// Verify that we can also load this with "?module".
// Generated Prisma clients can include this import style as an example.
import addModule2 from "./add.wasm?module";

const addInstance = new WebAssembly.Instance(addModule);
const add = addInstance.exports.add as (a: number, b: number) => number;

const add2Instance = new WebAssembly.Instance(addModule2);
const add2 = addInstance.exports.add as (a: number, b: number) => number;

export default <ExportedHandler>{
	fetch(request, env, ctx) {
		const url = new URL(request.url);
		const a = parseInt(url.searchParams.get("a") ?? "0");
		const b = parseInt(url.searchParams.get("b") ?? "0");
		const result = add(a, b);

		if (result !== add2(a, b)) {
			return new Response("add mismatch");
		}

		return new Response(result.toString());
	},
};
