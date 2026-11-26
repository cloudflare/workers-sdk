import { describe, it } from "vitest";
import { bindings } from "../bindings";
import { BindingSchema } from "../schema";

const streamId = "0123456789abcdef0123456789abcdef";

describe("Pipelines bindings", () => {
	it("accepts a stream ID", ({ expect }) => {
		const binding = bindings.pipeline({ streamId });
		expect(BindingSchema.parse(binding)).toEqual(binding);
	});

	it.for([undefined, null, 42, {}])(
		"requires a string stream ID: %j",
		(value, { expect }) => {
			expect(
				BindingSchema.safeParse({ type: "pipeline", streamId: value }).success
			).toBe(false);
		}
	);

	it.for([
		{ type: "pipeline", name: "my-stream" },
		{ type: "pipeline", name: streamId, streamId },
	])("explains that `name` was renamed: %j", (binding, { expect }) => {
		const result = BindingSchema.safeParse(binding);
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]).toMatchObject({
			path: ["name"],
			message:
				'"name" was renamed to "streamId". Set "streamId" to the ID of the Pipelines stream, not its name.',
		});
	});
});
