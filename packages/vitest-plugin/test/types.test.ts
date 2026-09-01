import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRuntimeTypes } from "@cloudflare/runtime-types";
import { removeDir } from "@cloudflare/workers-utils";
import ts from "typescript";
import { it } from "vitest";

it("composes cloudflare:test types with generated runtime types when library checking is enabled", async ({
	expect,
}) => {
	const temporaryDirectory = await mkdtemp(
		path.join(tmpdir(), "vitest-plugin-types-")
	);

	try {
		const { runtimeTypes } = await generateRuntimeTypes({
			compatibilityDate: "2026-08-04",
		});
		const runtimeTypesPath = path.join(
			temporaryDirectory,
			"worker-configuration.d.ts"
		);
		const testSourcePath = path.join(temporaryDirectory, "test.ts");
		const cloudflareTestTypesPath = fileURLToPath(
			new URL("../types/cloudflare-test.d.ts", import.meta.url)
		);

		await writeFile(
			runtimeTypesPath,
			`declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./test");
		durableNamespaces: "TestObject";
	}
	interface Env {}
}
interface Env extends Cloudflare.Env {}

${runtimeTypes}`
		);
		await writeFile(
			testSourcePath,
			`import {
	createExecutionContext,
	createMessageBatch,
	createPagesEventContext,
	createScheduledController,
	getQueueResult,
	listDurableObjectIds,
	runInDurableObject,
} from "cloudflare:test";
import { DurableObject as ModuleDurableObject } from "cloudflare:workers";

export class TestObject extends ModuleDurableObject {
	ping() {
		return "pong";
	}
}

class LegacyObject implements DurableObject {
	fetch() {
		return new Response("ok");
	}

	ping() {
		return "pong";
	}
}

declare const namespace: DurableObjectNamespace<TestObject>;
const stub = namespace.getByName("test");
void runInDurableObject(stub, async (instance) => instance.ping());
declare const legacyStub: DurableObjectStub;
void runInDurableObject(legacyStub, async (instance: LegacyObject) =>
	instance.ping()
);
void listDurableObjectIds(namespace);
void createScheduledController({
	scheduledTime: new Date(),
	cron: "* * * * *",
});
const batch = createMessageBatch("test", [
	{
		id: "message",
		timestamp: new Date(),
		attempts: 1,
		body: { value: "test" },
	},
]);
createMessageBatch("test", [
	{
		id: "serialized-message",
		timestamp: new Date(),
		attempts: 1,
		// @ts-expect-error createMessageBatch rejects serialized bodies at runtime
		serializedBody: new ArrayBuffer(0),
	},
]);
void getQueueResult(batch, createExecutionContext());

type Handler = PagesFunction<Cloudflare.Env, "id", { value: string }>;
declare const request: Request<unknown, IncomingRequestCfProperties>;
void createPagesEventContext<Handler>({
	request,
	params: { id: "test" },
	data: { value: "test" },
});
`
		);

		const program = ts.createProgram({
			rootNames: [runtimeTypesPath, cloudflareTestTypesPath, testSourcePath],
			options: {
				lib: ["lib.esnext.d.ts"],
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				noEmit: true,
				skipLibCheck: false,
				strict: true,
				target: ts.ScriptTarget.ESNext,
				types: [],
			},
		});
		const diagnostics = ts.getPreEmitDiagnostics(program);
		const formattedDiagnostics = ts.formatDiagnostics(diagnostics, {
			getCanonicalFileName: (fileName) => fileName,
			getCurrentDirectory: () => temporaryDirectory,
			getNewLine: () => "\n",
		});

		expect(formattedDiagnostics).toBe("");
	} finally {
		await removeDir(temporaryDirectory);
	}
});
