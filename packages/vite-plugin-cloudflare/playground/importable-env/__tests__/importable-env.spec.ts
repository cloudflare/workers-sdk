import { test } from "vitest";
import { getJsonResponse, serverLogs } from "../../__test-utils__";

test("the importable env is accessible outside the request handler", ({
	expect,
}) => {
	expect(serverLogs.info.join()).toMatch(
		/outside of request handler: importedEnv\["importable-env_VAR"\] === "my importable env variable"/
	);
});

test("the fetch handler env contains the local secret", async ({ expect }) => {
	const json = (await getJsonResponse()) as Record<string, unknown>;
	expect(json["entries of the fetch handler env"]).toEqual([
		{
			key: "importable-env_VAR",
			value: "my importable env variable",
		},
		{
			key: "importable-env_SECRET",
			value: "my importable env secret",
		},
	]);
});

test("the imported env contains the local secret", async ({ expect }) => {
	const json = (await getJsonResponse()) as Record<string, unknown>;
	expect(json["entries of the imported env"]).toEqual([
		{
			key: "importable-env_VAR",
			value: "my importable env variable",
		},
		{
			key: "importable-env_SECRET",
			value: "my importable env secret",
		},
	]);
});

test("the handler and imported env contain the same entries", async ({
	expect,
}) => {
	const json = (await getJsonResponse()) as Record<string, unknown>;
	expect(json["are the two set of entries the same?"]).toBe(true);
});
