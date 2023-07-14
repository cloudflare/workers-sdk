import { spawnSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { sync as commandExistsSync } from "command-exists";

export function callCapnp(capnp_schemas: string[], capnp_src_prefix?: string) {
	if (!commandExistsSync("capnp")) {
		throw new Error(
			"The capnp compiler is required to upload capnp schemas, but is not present."
		);
	}
	const srcPrefix = capnp_src_prefix
		? isAbsolute(capnp_src_prefix)
			? capnp_src_prefix
			: join(process.cwd(), capnp_src_prefix)
		: process.cwd();
	const capnpProcess = spawnSync("capnp", [
		"compile",
		"-o-",
		`--src-prefix=${srcPrefix}`,
		...capnp_schemas,
	]);
	if (capnpProcess.error) throw capnpProcess.error;
	if (capnpProcess.stderr.length)
		throw new Error(capnpProcess.stderr.toString());
	return capnpProcess.stdout;
}
