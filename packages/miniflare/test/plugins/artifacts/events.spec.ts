import { expectTypeOf, test } from "vitest";
import { V1 } from "../../../src/workers/artifacts/events";

test("V1 constructors return event-specific types", ({ expect }) => {
	expect(Object.keys(V1)).toHaveLength(12);
	expectTypeOf<
		ReturnType<typeof V1.repoCreated>["type"]
	>().toEqualTypeOf<"repo.created.v1">();
	expectTypeOf<
		ReturnType<typeof V1.repoForked>["payload"]["forkedFrom"]
	>().toEqualTypeOf<{
		namespace: string;
		name: string;
	}>();
	expectTypeOf<
		ReturnType<
			typeof V1.repoPushed
		>["payload"]["push"]["commits"][number]["messageTruncated"]
	>().toEqualTypeOf<boolean>();
	expectTypeOf<
		ReturnType<typeof V1.tokenCreated>["payload"]["token"]
	>().toEqualTypeOf<{
		id: string;
		scope: string;
		expiresAt: string;
	}>();
});
