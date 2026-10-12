module.exports = async function add(a, b) {
	const { default: addModule } = require("./add.wasm?module");
	const addInstance = new WebAssembly.Instance(addModule);
	return addInstance.exports.add(a, b);
};
