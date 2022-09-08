import {
	fetch as miniflareFetch,
	Headers as MiniflareHeaders,
	Request as MiniflareRequest,
	Response as MiniflareResponse,
} from "@miniflare/core";
import { polyfill } from ".";

polyfill({
	fetch: miniflareFetch,
	Headers: MiniflareHeaders,
	Request: MiniflareRequest,
	Response: MiniflareResponse,
});
