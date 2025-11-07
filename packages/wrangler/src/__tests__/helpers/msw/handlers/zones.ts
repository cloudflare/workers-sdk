import { http, HttpResponse } from "msw";

import { createFetchResult } from "../index";

export default [
	http.get("*/zones", ({ request }) => {
		const url = new URL(request.url);

		return HttpResponse.json(
			createFetchResult(
				url.searchParams.get("name") === "exists.com"
					? [
							{
								id: "exists-com",
							},
						]
					: []
			)
		);
	}),
];
