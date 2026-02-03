import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import * as z from "zod/v4";
import { bustOldCache } from "./autoCacheBust";

export const router = new Hono<{ Bindings: Env }>();

const paramValidator = z.object({
	artifactID: z.string(),
	teamID: z.string().optional(),
});
const queryValidator = z.object({
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

router.onError((error, c) => {
	if (error instanceof HTTPException) {
		return error.getResponse();
	}
	return c.json({ ...error }, 500);
});

router.use("*", cors());

router.use("*", async (c, next) => {
	const middleware = bearerAuth({ token: c.env.TURBO_TOKEN });
	await middleware(c, next);
});

router.post("/artifacts/manual-cache-bust", async (c) => {
	/**
	 * manual cache busting, it will bust the entire cache.
	 */
	await bustOldCache(c.env.R2_ARTIFACT_ARCHIVE);

	// maybe this could return the keys that were busted?
	return c.json({ success: true });
});

router.put(
	"/v8/artifacts/:artifactID",
	zValidator("param", paramValidator),
	zValidator("query", queryValidator),
	async (c) => {
		const { artifactID } = c.req.valid("param");
		const { teamId, slug } = c.req.valid("query");
		const teamID = teamId ?? slug;

		if (!teamID) {
			return c.json({ error: "MISSING_TEAM_ID" }, 400);
		}

		if (c.req.raw.headers.get("Content-Type") !== "application/octet-stream") {
			return c.json({ error: "EXPECTED_OCTET_STREAM" }, 415);
		}

		const artifactTag = c.req.raw.headers.get("x-artifact-tag");
		const r2Object = await c.env.R2_ARTIFACT_ARCHIVE.put(
			`${teamID}/${artifactID}`,
			c.req.raw.body,
			{
				customMetadata: artifactTag
					? {
							artifactTag,
						}
					: undefined,
			}
		);

		return c.json(
			{ teamID, artifactID, storagePath: r2Object.key, size: r2Object.size },
			201
		);
	}
);

router.get(
	"/v8/artifacts/:artifactID",
	zValidator("param", paramValidator),
	zValidator("query", queryValidator),
	async (c) => {
		const { artifactID } = c.req.valid("param");
		const { teamId, slug } = c.req.valid("query");
		const teamID = teamId ?? slug;

		if (!teamID) {
			return c.json({ error: "MISSING_TEAM_ID & QUERY" }, 400);
		}

		if (artifactID === "list") {
			const list = await c.env.R2_ARTIFACT_ARCHIVE.list();
			return c.json(list.objects);
		}

		const r2Object = await c.env.R2_ARTIFACT_ARCHIVE.get(
			`${teamID}/${artifactID}`
		);
		if (!r2Object) {
			return c.notFound();
		}

		c.header("Content-Type", "application/octet-stream");
		if (r2Object.customMetadata?.artifactTag) {
			c.header("x-artifact-tag", r2Object.customMetadata.artifactTag);
		}

		c.status(200);
		return c.body(r2Object.body);
	}
);

router.post("/v8/artifacts/events", (c) => {
	// Hook this up to Cloudflare Analytics
	c.status(204);
	return c.body(null);
});
