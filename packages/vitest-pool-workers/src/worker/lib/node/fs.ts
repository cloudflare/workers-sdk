function throwNotFound(path: string): never {
	const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
	Object.assign(error, {
		errno: -2,
		syscall: "open",
		code: "ENOENT",
		path,
	});
	throw error;
}

export function existsSync(_path: string) {
	// TODO(soon): figure out what's calling this and why, probably needed for
	//  snapshots
	// console.log("fs.ts:existsSync", path);
	return false;
}

export function readdirSync(path: string) {
	console.log("fs.ts:readdirSync", path);
	return [];
}

export function readFileSync(path: string) {
	console.log("fs.ts:readFileSync", path);
	throwNotFound(path);
}

export class Stats {}
export function statSync(path: string) {
	console.log("fs.ts:readdirSync", path);
	throwNotFound(path);
}

export function realpathSync(path: string) {
	console.log("fs.ts:realpathSync", path);
	throwNotFound(path);
}

export const promises = {
	async readFile(path: string) {
		console.log("fs.ts:promises.readFile", path);
		throwNotFound(path);
	},
};

export default {};
