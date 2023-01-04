// Serve different variants of your site to different visitors

export default {
	/**
	 * @param {Request} request
	 * @returns {Promise<Response>}
	 */
	async fetch(request) {
		const name = "experiment-0";
		let group; // 'control' or 'test', set below
		let isNew = false; // is the group newly-assigned?

		// Determine which group this request is in.
		const cookie = request.headers.get("Cookie");
		if (cookie && cookie.includes(`${name}=control`)) {
			group = "control";
		} else if (cookie && cookie.includes(`${name}=test`)) {
			group = "test";
		} else {
			// 50/50 Split
			group = Math.random() < 0.5 ? "control" : "test";
			isNew = true;
		}

		// We'll prefix the request path with the experiment name. This way,
		// the origin server merely has to have two copies of the site under
		// top-level directories named "control" and "test".
		let url = new URL(request.url);
		url.pathname = `/${group}${url.pathname}`;

		// dispatch the modified request
		const response = await fetch(url, {
			method: request.method,
			headers: request.headers,
		});

		if (isNew) {
			// The experiment was newly-assigned, so add
			// a Set-Cookie header to the response.
			const newHeaders = new Headers(response.headers);
			newHeaders.append("Set-Cookie", `${name}=${group}`);
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers: newHeaders,
			});
		} else {
			// Return response unmodified.
			return response;
		}
	},
};
