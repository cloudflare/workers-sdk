import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";

// @ts-expect-error this points to generated assets
import * as build from "../build";

const handleRequest = createPagesFunctionHandler({
	build,
});

export function onRequest(context) {
	return handleRequest(context);
}
