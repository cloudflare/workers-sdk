import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { ImageRegistriesService } from "../src/client";
import { getCloudflareContainerRegistry } from "../src/knobs";
import {
	deleteContainerImage,
	listContainerImages,
	parseContainerImageTag,
} from "../src/registry-images";

const fetchMock = vi.fn<typeof fetch>();
const options = { accountId: "account" };
beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.spyOn(
		ImageRegistriesService,
		"generateImageRegistryCredentials"
	).mockResolvedValue({ password: "secret" } as Awaited<
		ReturnType<typeof ImageRegistriesService.generateImageRegistryCredentials>
	>);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("managed registry image operations", () => {
	it("lists user tags, removes account prefixes, and filters full repository names", async ({
		expect,
	}) => {
		fetchMock.mockResolvedValueOnce(
			Response.json({
				repositories: {
					"/account/team/app": ["latest", "sha256-deadbeef"],
					"account/empty": [],
					"account/digest": ["sha256:deadbeef"],
					"account/other": ["v1"],
				},
			})
		);
		expect(
			await listContainerImages({
				...options,
				filter: "^account/(team|empty|digest)",
			})
		).toEqual([{ name: "team/app", tags: ["latest"] }]);
		expect(
			ImageRegistriesService.generateImageRegistryCredentials
		).toHaveBeenCalledWith(getCloudflareContainerRegistry(), {
			expiration_minutes: 5,
			permissions: ["pull"],
		});
		expect(fetchMock).toHaveBeenCalledWith(
			`https://${getCloudflareContainerRegistry()}/v2/_catalog?tags=true`,
			expect.objectContaining({
				headers: {
					Authorization: `Basic ${Buffer.from("v1:secret").toString("base64")}`,
				},
			})
		);
	});
	for (const bracketed of [false, true]) {
		it(`merges catalog pages using ${bracketed ? "standard" : "bare"} links`, async ({
			expect,
		}) => {
			const next = `https://${getCloudflareContainerRegistry()}/v2/_catalog?tags=true&last=a%2Bb%2F%3D`;
			fetchMock
				.mockResolvedValueOnce(
					Response.json(
						{ repositories: { "account/app": ["v1", "sha256:abc"] } },
						{
							headers: {
								Link: bracketed ? `<${next}>; rel="next"` : `${next}; rel=next`,
							},
						}
					)
				)
				.mockResolvedValueOnce(
					Response.json({
						repositories: {
							"account/app": ["v1", "v2"],
							"account/other": ["latest"],
						},
					})
				);
			expect(await listContainerImages({ ...options, filter: "app$" })).toEqual(
				[{ name: "app", tags: ["v1", "v2"] }]
			);
			expect(fetchMock.mock.calls[1][0]).toBe(next);
			expect(
				ImageRegistriesService.generateImageRegistryCredentials
			).toHaveBeenCalledTimes(1);
		});
	}
	it("keeps pagination credentials on the configured registry", async ({
		expect,
	}) => {
		fetchMock
			.mockResolvedValueOnce(
				Response.json(
					{ repositories: {} },
					{
						headers: {
							Link: '<https://other.example/v2/_catalog?last=next>; rel="next"',
						},
					}
				)
			)
			.mockResolvedValueOnce(
				Response.json({ repositories: { "account/app": ["v1"] } })
			);
		await listContainerImages(options);
		expect(fetchMock.mock.calls[1][0]).toBe(
			`https://${getCloudflareContainerRegistry()}/v2/_catalog?tags=true&last=next`
		);
	});
	it("rejects repeated cursors instead of looping", async ({ expect }) => {
		fetchMock.mockImplementation(async () =>
			Response.json(
				{ repositories: {} },
				{
					headers: { Link: '</v2/_catalog?last=same>; rel="next"' },
				}
			)
		);
		await expect(listContainerImages(options)).rejects.toThrow(
			"repeated a cursor"
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("rejects next-page links without a cursor", async ({ expect }) => {
		fetchMock.mockResolvedValueOnce(
			Response.json(
				{ repositories: {} },
				{
					headers: { Link: '</v2/_catalog>; rel="next"' },
				}
			)
		);
		await expect(listContainerImages(options)).rejects.toThrow(
			"missing a cursor"
		);
	});
	it("rejects a later-page failure instead of returning partial results", async ({
		expect,
	}) => {
		fetchMock
			.mockResolvedValueOnce(
				Response.json(
					{ repositories: { "account/app": ["v1"] } },
					{
						headers: { Link: '</v2/_catalog?last=next>; rel="next"' },
					}
				)
			)
			.mockResolvedValueOnce(new Response(null, { status: 503 }));
		await expect(listContainerImages(options)).rejects.toThrow(
			"Failed to fetch repository catalog: 503"
		);
	});
	it("returns an empty list for an empty catalog", async ({ expect }) => {
		fetchMock.mockResolvedValueOnce(Response.json({}));
		expect(await listContainerImages(options)).toEqual([]);
	});
	it("rejects invalid filters before requesting credentials", async ({
		expect,
	}) => {
		await expect(
			listContainerImages({ ...options, filter: "[" })
		).rejects.toThrow();
		expect(
			ImageRegistriesService.generateImageRegistryCredentials
		).not.toHaveBeenCalled();
	});
	it("uses the configured compliance registry", async ({ expect }) => {
		const complianceConfig = { compliance_region: "fedramp_high" as const };
		fetchMock.mockResolvedValueOnce(Response.json({}));
		await listContainerImages({ ...options, complianceConfig });
		expect(
			ImageRegistriesService.generateImageRegistryCredentials
		).toHaveBeenCalledWith(
			getCloudflareContainerRegistry(complianceConfig),
			expect.anything()
		);
		expect(fetchMock).toHaveBeenCalledWith(
			`https://${getCloudflareContainerRegistry(complianceConfig)}/v2/_catalog?tags=true`,
			expect.anything()
		);
	});
	it("deletes the tag rather than the manifest digest, then requests GC", async ({
		expect,
	}) => {
		fetchMock
			.mockResolvedValueOnce(
				new Response(null, {
					headers: { "Docker-Content-Digest": "sha256:abc" },
				})
			)
			.mockResolvedValueOnce(new Response(null, { status: 202 }))
			.mockResolvedValueOnce(new Response(null, { status: 202 }));
		expect(
			await deleteContainerImage({ ...options, image: "team/app:v1" })
		).toEqual({ digest: "sha256:abc" });
		expect(
			ImageRegistriesService.generateImageRegistryCredentials
		).toHaveBeenCalledWith(getCloudflareContainerRegistry(), {
			expiration_minutes: 5,
			permissions: ["pull", "push"],
		});
		const base = `https://${getCloudflareContainerRegistry()}`;
		expect(
			fetchMock.mock.calls.map(([url, init]) => [url, init?.method])
		).toEqual([
			[`${base}/v2/account/team/app/manifests/v1`, "HEAD"],
			[`${base}/v2/account/team/app/manifests/v1`, "DELETE"],
			[`${base}/v2/gc/layers`, "PUT"],
		]);
	});
	for (const tag of ["v1", "_latest", "V1.0-rc_1", "a".repeat(128)]) {
		it(`accepts valid tag ${tag} in a nested repository`, ({ expect }) => {
			expect(parseContainerImageTag(`team/app:${tag}`)).toEqual({
				repository: "team/app",
				tag,
			});
		});
	}
	for (const image of [
		"app",
		"app:",
		":tag",
		"app:tag:extra",
		"../app:tag",
		"app:tag?other",
		"app:tag/other",
		"app:..",
		"%2e%2e/app:tag",
		"app:tag%3Fother",
		"app:-latest",
		"app:.latest",
		"app:a&b",
		"app:a=b",
		"app:a[b",
		"app:café",
		`app:${"a".repeat(129)}`,
	]) {
		it(`rejects malformed reference ${image} before network requests`, async ({
			expect,
		}) => {
			expect(() => parseContainerImageTag(image)).toThrow("Expected IMAGE:TAG");
			await expect(deleteContainerImage({ ...options, image })).rejects.toThrow(
				"Expected IMAGE:TAG"
			);
			expect(
				ImageRegistriesService.generateImageRegistryCredentials
			).not.toHaveBeenCalled();
			expect(fetchMock).not.toHaveBeenCalled();
		});
	}
	it("does not delete a tag whose digest cannot be retrieved", async ({
		expect,
	}) => {
		fetchMock.mockResolvedValueOnce(new Response(null));
		await expect(
			deleteContainerImage({ ...options, image: "app:v1" })
		).rejects.toThrow("Digest not found");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	for (const networkError of [false, true]) {
		it(`returns deletion success with a warning on GC ${networkError ? "network" : "HTTP"} failure`, async ({
			expect,
		}) => {
			fetchMock
				.mockResolvedValueOnce(
					new Response(null, {
						headers: { "Docker-Content-Digest": "sha256:abc" },
					})
				)
				.mockResolvedValueOnce(new Response(null, { status: 202 }));
			if (networkError) {
				fetchMock.mockRejectedValueOnce(new Error("connection reset"));
			} else {
				fetchMock.mockResolvedValueOnce(
					new Response(null, { status: 503, statusText: "Unavailable" })
				);
			}
			expect(
				await deleteContainerImage({ ...options, image: "app:v1" })
			).toEqual({
				digest: "sha256:abc",
				warning: `Image app:v1 was deleted, but the garbage-collection request failed: ${networkError ? "connection reset" : "503 Unavailable"}`,
			});
			expect(fetchMock).toHaveBeenCalledTimes(3);
		});
	}
	for (const step of [0, 1]) {
		it(`reports a failure at deletion step ${step} and stops`, async ({
			expect,
		}) => {
			for (let i = 0; i < step; i++) {
				fetchMock.mockResolvedValueOnce(
					new Response(null, {
						headers: { "Docker-Content-Digest": "sha256:abc" },
					})
				);
			}
			fetchMock.mockResolvedValueOnce(
				new Response(null, { status: 403, statusText: "Forbidden" })
			);
			await expect(
				deleteContainerImage({ ...options, image: "app:v1" })
			).rejects.toThrow("403 Forbidden");
			expect(fetchMock).toHaveBeenCalledTimes(step + 1);
		});
	}
	it("reports catalog failures without exposing registry credentials", async ({
		expect,
	}) => {
		fetchMock.mockResolvedValueOnce(
			new Response(null, { status: 403, statusText: "Forbidden" })
		);
		await expect(listContainerImages(options)).rejects.toThrow(
			"Failed to fetch repository catalog: 403 Forbidden"
		);
	});
});
