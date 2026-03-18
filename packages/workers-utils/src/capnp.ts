import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { sync as commandExistsSync } from "command-exists";
import type { CfCapnp } from "@cloudflare/workers-utils";

export function handleUnsafeCapnp(capnp: CfCapnp): Buffer {
	if (capnp.compiled_schema) {
		return readFileSync(resolve(capnp.compiled_schema));
	}

	const { base_path, source_schemas } = capnp;
	const capnpSchemas = (source_schemas ?? []).map((x) =>
		resolve(base_path as string, x)
	);
	if (!commandExistsSync("capnp")) {
		throw new UserError(
			"The capnp compiler is required to upload capnp schemas, but is not present."
		);
	}
	const srcPrefix = resolve(base_path ?? ".");
	const capnpProcess = spawnSync(
		"capnp",
		["compile", "-o-", `--src-prefix=${srcPrefix}`, ...capnpSchemas],
		// This number was chosen arbitrarily. If you get ENOBUFS because your compiled schema is still
		// too large, then we may need to bump this again or figure out another approach.
		// https://github.com/cloudflare/workers-sdk/pull/10217
		{ maxBuffer: 3 * 1024 * 1024 }
	);
	if (capnpProcess.error) {
		throw capnpProcess.error;
	}
	if (capnpProcess.stderr.length) {
		throw new Error(capnpProcess.stderr.toString());
	}
	return capnpProcess.stdout;
}
