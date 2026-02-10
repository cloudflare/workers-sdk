import { createRenderer } from "@cloudflare/style-provider";

let renderer: ReturnType<typeof createRenderer>;

export const getRenderer = ({ selectorPrefix = "c_" } = {}) => {
	if (!renderer) {
		renderer = createRenderer({
			// @ts-expect-error Fix internal libs
			dev: process.env.NODE_ENV === "development",
			selectorPrefix,
		});
	}

	return renderer;
};
