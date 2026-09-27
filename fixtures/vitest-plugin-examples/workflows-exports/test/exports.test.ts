import {
	introspectWorkflow,
	introspectWorkflowInstance,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { it } from "vitest";

it("runs a Workflow declared in `exports` through `ctx.exports`", async ({
	expect,
}) => {
	const response = await exports.default.fetch(
		"https://example.com/?name=Workers"
	);
	const { id } = await response.json<{ id: string }>();

	await expect
		.poll(async () => {
			const response = await exports.default.fetch(
				`https://example.com/?id=${id}`
			);
			return response.json();
		})
		.toMatchObject({ status: "complete", output: "Hello, Workers!" });
});

it("introspects instances created through `ctx.exports` with a binding", async ({
	expect,
}) => {
	await using introspector = await introspectWorkflow(env.GREETING_WORKFLOW);
	await introspector.modifyAll(async (m) => {
		await m.mockStepResult({ name: "greet" }, "Hello, mock!");
	});

	await exports.default.fetch("https://example.com/");

	const instances = await introspector.get();
	expect(instances).toHaveLength(1);
	await instances[0].waitForStatus("complete");
	expect(await instances[0].getOutput()).toBe("Hello, mock!");
});

it("rejects introspecting a Workflow on `ctx.exports`", async ({ expect }) => {
	await expect(introspectWorkflow(exports.GreetingWorkflow)).rejects.toThrow(
		"`introspectWorkflow()` needs a Workflow binding from `env`"
	);
	await expect(
		introspectWorkflowInstance(exports.GreetingWorkflow, "an-id")
	).rejects.toThrow(
		"`introspectWorkflowInstance()` needs a Workflow binding from `env`"
	);
});
