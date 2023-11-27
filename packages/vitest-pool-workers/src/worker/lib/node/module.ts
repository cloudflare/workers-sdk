// https://nodejs.org/api/module.html#modulebuiltinmodules
export const builtinModules: string[] = [];

// https://nodejs.org/api/module.html#modulecreaterequirefilename
export function createRequire(_filename: string) {
	const require = () => {
		throw new Error("require() is not yet implemented in worker");
	};
	Object.defineProperty(require, "extensions", { value: [] });
	return require;
}

// https://nodejs.org/api/module.html#moduleisbuiltinmodulename
export function isBuiltin(moduleName: string): boolean {
	if (moduleName.startsWith("node:")) {
		moduleName = moduleName.substring("node:".length);
	}
	return builtinModules.includes(moduleName);
}

// https://nodejs.org/api/module.html#modulesyncbuiltinesmexports
export function syncBuiltinESMExports() {
	throw new Error("syncBuiltinESMExports() is not yet implemented in worker");
}

// https://nodejs.org/api/module.html#modulefindsourcemappath
export function findSourceMap(_path: string) {
	return undefined;
}

// https://nodejs.org/api/module.html#class-modulesourcemap
export class SourceMap {
	constructor() {
		throw new Error("new SourceMap() is not yet implemented in worker");
	}
}

export class Module {}
