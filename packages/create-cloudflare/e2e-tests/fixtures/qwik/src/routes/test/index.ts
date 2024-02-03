import type { RequestHandler } from "@builder.io/qwik-city";

export const onGet: RequestHandler = async ({ platform, json }) => {
	if (!platform.env) {
		json(500, "Platform object not defined");
		return;
	}

	json(200, { value: platform.env["TEST"] || "wtf undefined?", version: 1 });
};
