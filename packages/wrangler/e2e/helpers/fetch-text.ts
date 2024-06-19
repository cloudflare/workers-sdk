import { fetch } from "undici";

export function fetchText(url: string) {
	return fetch(url, { headers: { "MF-Disable-Pretty-Error": "true" } }).then(
		(r) => r.text()
	);
}
