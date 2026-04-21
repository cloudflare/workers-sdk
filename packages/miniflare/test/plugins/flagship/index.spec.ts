import { FlagshipOptionsSchema } from "miniflare";
import { test } from "vitest";

test("FlagshipOptionsSchema: accepts valid flagship options", ({
	expect,
}) => {
	const result = FlagshipOptionsSchema.safeParse({
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
	});
	expect(result.success).toBe(true);
});

test("FlagshipOptionsSchema: accepts flagship with remoteProxyConnectionString", ({
	expect,
}) => {
	const result = FlagshipOptionsSchema.safeParse({
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
				remoteProxyConnectionString: "test-connection-string",
			},
		},
	});
	expect(result.success).toBe(true);
});

test("FlagshipOptionsSchema: accepts empty flagship", ({ expect }) => {
	const result = FlagshipOptionsSchema.safeParse({});
	expect(result.success).toBe(true);
});
