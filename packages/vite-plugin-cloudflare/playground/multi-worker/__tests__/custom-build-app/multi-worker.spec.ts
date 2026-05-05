import { describe, test } from "vitest";
import {
	getJsonResponse,
	isBuild,
	satisfiesViteVersion,
} from "../../../__test-utils__";

describe.runIf(isBuild && satisfiesViteVersion("7.0.0"))(
	"builds additional Worker environments not built in `builder.buildApp` config",
	() => {
		test("returns a response from another Worker", async ({ expect }) => {
			const result = await getJsonResponse("/fetch");
			expect(result).toEqual({ result: { name: "Worker B" } });
		});
	}
);
