import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The development broker is upstream in workerd, awaiting its first npm release.
// Generate from the pinned schema plus that additive field, preserving other
// fields in our runtime pin (including the stub retry policy).
const schemaPath = "node_modules/workerd/workerd.capnp";
let schema = readFileSync(schemaPath, "utf8");
if (!schema.includes("oidcTokenService @21")) {
	const marker = "  workflowsEngine @20 :WorkflowsEngine;";
	assert(
		schema.includes(marker),
		"Workerd schema changed; update the OIDC schema supplement."
	);
	schema = schema.replace(
		marker,
		`  oidcTokenService @21 :ServiceDesignator;
  # Trusted local development broker; POST /token, JSON audience, text/plain JWT.

${marker}`
	);
}
if (!schema.includes("oidc @29")) {
	const marker = "      workerdDebugPort @28";
	assert(
		schema.includes(marker),
		"Workerd binding schema changed; update the OIDC supplement."
	);
	schema = schema.replace(
		marker,
		"      oidc @29 :Text;\n      # Fixed binding selector for the trusted OIDC broker.\n\n" +
			marker
	);
}
const directory = mkdtempSync(path.join(tmpdir(), "miniflare-capnp-"));
try {
	const input = path.join(directory, "workerd.capnp");
	writeFileSync(input, schema);
	execFileSync(
		process.execPath,
		[
			"node_modules/capnp-es/dist/compiler/capnpc-js.mjs",
			input,
			"-ots:src/runtime/config/generated",
			`--src-prefix=${directory}`,
		],
		{ stdio: "inherit" }
	);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
