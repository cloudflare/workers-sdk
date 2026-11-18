import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";

const workflow = readFileSync(
	path.resolve(__dirname, "../../../.github/workflows/c3-e2e.yml"),
	"utf8"
);
const gate = workflow.slice(workflow.indexOf("\n  frameworks-e2e:"));
const script = / {8}run: \|\n((?: {10}.*\n)+)/.exec(gate)?.[1];
assert(script, "The C3 framework gate must execute a result check");

it.for(["success", "failure", "cancelled", "skipped"])(
	"the required framework gate accepts only successful shards (%s)",
	(result, { expect }) => {
		const execution = spawnSync("bash", ["-c", script], {
			encoding: "utf8",
			env: { ...process.env, FRAMEWORK_RESULT: result },
		});
		expect(execution.status, execution.stderr).toBe(
			result === "success" ? 0 : 1
		);
		expect(gate).toContain("needs: frameworks-e2e-shards");
		expect(gate).toContain("if: always()");
	}
);
