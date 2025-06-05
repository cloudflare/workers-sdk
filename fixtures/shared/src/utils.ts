import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export async function getTmpDir(prefix: string) {
	return mkdtemp(path.join(tmpdir(), prefix));
}
