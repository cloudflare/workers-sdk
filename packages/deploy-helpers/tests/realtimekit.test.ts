import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import {
	extractBuildOutputBindings,
	extractConfigBindings,
	getBindingValue,
} from "../src/preview/shared";

describe("RealtimeKit Preview bindings", () => {
	it("extracts Preview bindings without dropping remote opt-in", ({
		expect,
	}) => {
		expect(
			extractConfigBindings({
				...defaultWranglerConfig,
				previews: {
					realtimekit: [
						{ binding: "RTK", app_id: "preview-app", remote: true },
					],
				},
			})
		).toEqual({
			RTK: { type: "realtimekit", app_id: "preview-app", remote: true },
		});
	});

	it("extracts bindings from Build Output", ({ expect }) => {
		expect(
			extractBuildOutputBindings({
				realtimekit: [{ binding: "RTK", app_id: "app-id", remote: true }],
			})
		).toEqual({
			RTK: { type: "realtimekit", app_id: "app-id", remote: true },
		});
	});

	it("displays the app ID", ({ expect }) => {
		expect(
			getBindingValue({
				type: "realtimekit",
				app_id: "app-id",
				remote: true,
			})
		).toBe("app-id");
	});
});
