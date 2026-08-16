import { http, HttpResponse } from "msw";
import { createFetchResult, msw } from "../../helpers/msw";
import type { ExpectStatic } from "vitest";

type PatchLatestVersionEnvBinding = { type: "secret_text"; text: string };

export interface PatchLatestVersionPatch {
	annotations?: Record<string, string | undefined>;
	env?: Record<string, PatchLatestVersionEnvBinding | null>;

	// These fields should be inherited by PATCH/latest rather than resent.
	build_options?: never;
	keep_assets?: never;
	keep_bindings?: never;
	placement?: never;
}

export function expectSecretPatch(
	expect: ExpectStatic,
	patch: PatchLatestVersionPatch,
	secrets: Record<string, string | null>
) {
	expect(patch).toMatchObject({
		env: Object.fromEntries(
			Object.entries(secrets).map(([name, value]) => [
				name,
				value === null ? null : { type: "secret_text", text: value },
			])
		),
	});
	expect(patch.keep_bindings).toBeUndefined();
	expect(patch.keep_assets).toBeUndefined();
	expect(patch.placement).toBeUndefined();
	expect(patch).not.toHaveProperty("build_options");
}

export function mockPatchLatestVersion(
	expect: ExpectStatic,
	validate?: (patch: PatchLatestVersionPatch) => void
) {
	msw.use(
		http.patch(
			`*/accounts/:accountId/workers/workers/:scriptName/versions/latest`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toMatch(/script-name(-test)?/);
				expect(request.headers.get("content-type")).toEqual(
					"application/merge-patch+json"
				);
				const patch = (await request.json()) as PatchLatestVersionPatch;

				if (validate) {
					validate(patch);
				}

				return HttpResponse.json(
					createFetchResult({
						id: "id",
						etag: "etag",
						deployment_id: "version-id",
					})
				);
			},
			{ once: true }
		)
	);
}

export function mockPatchLatestVersionNoVersions(expect: ExpectStatic) {
	msw.use(
		http.patch(
			`*/accounts/:accountId/workers/workers/:scriptName/versions/latest`,
			({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toMatch(/script-name(-test)?/);
				expect(request.headers.get("content-type")).toEqual(
					"application/merge-patch+json"
				);

				return HttpResponse.json(
					createFetchResult(null, false, [
						{
							code: 10222,
							message:
								"This Worker has no versions, which means this Worker has no content or versioned settings.",
						},
					]),
					{ status: 404 }
				);
			},
			{ once: true }
		)
	);
}
