import { test, vi } from "vitest";
import {
	getJsonResponse,
	getTextResponse,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

test("should be able to create a pg Client", async ({ expect }) => {
	await vi.waitFor(
		async () =>
			expect(await getTextResponse()).toMatchInlineSnapshot(
				`"hh-pgsql-public.ebi.ac.uk"`
			),
		WAIT_FOR_OPTIONS
	);
});

// Disabling actually querying the database in CI since we are getting this error:
// > too many connections for role 'reader'
test.runIf(!process.env.CI)(
	"should be able to use pg library to send a query",
	async ({ expect }) => {
		await vi.waitFor(
			async () =>
				expect(await getJsonResponse("/send-query")).toEqual(
					expect.objectContaining({ id: "21" })
				),
			WAIT_FOR_OPTIONS
		);
	}
);
