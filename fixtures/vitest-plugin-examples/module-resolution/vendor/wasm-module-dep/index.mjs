export default async function add(a, b) {
	const { default: addModule } = await import(
		/* @vite-ignore */ "./add.wasm?module"
	);
	const addInstance = new WebAssembly.Instance(addModule);
	return addInstance.exports.add(a, b);
}
