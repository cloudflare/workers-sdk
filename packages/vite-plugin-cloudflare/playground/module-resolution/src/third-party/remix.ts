import { createCookie } from "@remix-run/cloudflare";

export default {
	"(remix) remixRunCloudflareCookieName": createCookie(
		"my-remix-run-cloudflare-cookie"
	).name,
};
