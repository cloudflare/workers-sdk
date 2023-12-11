// https://nodejs.org/api/module.html#modulebuiltinmodules
export const builtinModules: string[] = [];

// https://nodejs.org/api/module.html#modulecreaterequirefilename
export function createRequire(_filename: string) {
	return () => {
		throw new Error("require() is not yet implemented in worker");
	};
}

export class Module {}
