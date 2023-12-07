import assert from "node:assert";
import { getSerializedOptions } from "./env";
import type { VitestExecutor } from "vitest/execute";

interface ImportRequest {
	importId: number;
	specifier: string;
}
function isImportRequest(value: unknown): value is ImportRequest {
	return (
		typeof value === "object" &&
		value !== null &&
		"importId" in value &&
		"specifier" in value &&
		typeof value.importId === "number" &&
		typeof value.specifier === "string"
	);
}

const CF_KEY_IMPORT = "vitestPoolWorkersImport";

let nextImportId = 0;
const importResults = new Map<number /* id */, unknown>();

export async function importModule(
	env: Env,
	specifier: string
): Promise<Record<string, unknown>> {
	const importId = nextImportId++;
	const importRequest: ImportRequest = { importId, specifier };
	// Ensure we resolve/fetch the module in the Durable Object with the open
	// connection to the pool, so we're not performing I/O on behalf of a
	// different object
	// @ts-expect-error `ColoLocalActorNamespace`s are not included in types
	const runnerStub = env.__VITEST_POOL_WORKERS_RUNNER_OBJECT.get("singleton");
	const runnerResponse = await runnerStub.fetch("http://x", {
		cf: { [CF_KEY_IMPORT]: importRequest },
	});
	const importResult = importResults.get(importId);
	importResults.delete(importId);
	assert(importResult !== undefined, `Expected import result for ${importId}`);
	if (runnerResponse.ok) {
		return importResult as Record<string, unknown>;
	} else {
		throw importResult;
	}
}

export async function maybeHandleImportRequest(
	executor: VitestExecutor | undefined,
	request: Request
): Promise<Response | undefined> {
	const importRequest = request.cf?.[CF_KEY_IMPORT];
	if (!isImportRequest(importRequest)) return;
	try {
		assert(
			executor !== undefined,
			"Expected Vitest to start running before importing modules"
		);
		// TODO(soon): note this won't re-run dependent tests if `specifier`
		//  changes, unless `specifier` can be statically analysed as an import
		//  in a test file, see `pool/index.ts` for potential fixes
		const result = await executor.executeId(importRequest.specifier);
		importResults.set(importRequest.importId, result);
		return new Response(null, { status: 204 });
	} catch (e) {
		importResults.set(importRequest.importId, e);
		return new Response(null, { status: 500 });
	}
}

export function mustGetResolvedMainPath(
	forBindingType: "service" | "Durable Object"
): string {
	const options = getSerializedOptions();
	if (options.main === undefined) {
		throw new Error(
			`Using ${forBindingType} bindings to the current worker requires \`poolOptions.miniflare.main\` to be set to your worker's entrypoint`
		);
	}
	return options.main;
}
