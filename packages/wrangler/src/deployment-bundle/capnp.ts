import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sync as commandExistsSync } from "command-exists";
import type { CfCapnp } from "./worker";

export function handleUnsafeCapnp(capnp: CfCapnp): Buffer {
	if (capnp.compiled_schema) {
		return readFileSync(resolve(capnp.compiled_schema));
	}

	const { base_path, source_schemas } = capnp;
	const capnpSchemas = (source_schemas ?? []).map((x) =>
		resolve(base_path as string, x)
	);
	if (!commandExistsSync("capnp")) {
		throw new Error(
			"The capnp compiler is required to upload capnp schemas, but is not present."
		);
	}
	const srcPrefix = resolve(base_path ?? ".");
	const capnpProcess = spawnSync("capnp", [
		"compile",
		"-o-",
		`--src-prefix=${srcPrefix}`,
		...capnpSchemas,
	]);
	if (capnpProcess.error) throw capnpProcess.error;
	if (capnpProcess.stderr.length)
		throw new Error(capnpProcess.stderr.toString());
	return capnpProcess.stdout;
}
