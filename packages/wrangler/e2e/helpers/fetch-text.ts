import { fetch } from "undici";

export function fetchText(url: string) {
	return fetch(url).then((r) => r.text());
}
