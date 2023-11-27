export async function readFile(path: string) {
	console.log("fs/promises.ts:readFile", path);
	const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
	Object.assign(error, {
		errno: -2,
		syscall: "open",
		code: "ENOENT",
		path,
	});
	throw error;
}

export default {
	readFile,
};
