// https://nodejs.org/api/module.html#modulebuiltinmodules
export const builtinModules: string[] = [];

// https://nodejs.org/api/module.html#modulecreaterequirefilename
export function createRequire(filename: string) {
	return (specifier: string) => {
		const quotedSpecifier = JSON.stringify(specifier);
		const quotedFilename = JSON.stringify(filename);
		const message = `Attempted to \`require(${quotedSpecifier})\` from ${quotedFilename}`;
		// Vitest can swallow stack traces making this error tricky to debug.
		// To get around this, include a stack trace in the error message itself.
		const stack = (new Error(message).stack ?? "").replace("Error: ", "");
		throw new Error(
			`\`require()\` is not yet implemented in Workers.\n${stack}`
		);
	};
}

export class Module {}
