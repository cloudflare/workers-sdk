import ANALYTICS_ENGINE from "worker:analytics-engine/analytics-engine";
import * as z from "zod/v4";
import { Worker_Binding } from "../../runtime";
import { PersistenceSchema, Plugin, ProxyNodeBinding } from "../shared";

const AnalyticsEngineSchema = z.record(
	z.object({
		dataset: z.string(),
	})
);

export const AnalyticsEngineSchemaOptionsSchema = z.object({
	analyticsEngineDatasets: AnalyticsEngineSchema.optional(),
});

export const AnalyticsEngineSchemaSharedOptionsSchema = z.object({
	analyticsEngineDatasetsPersist: PersistenceSchema,
});

export const ANALYTICS_ENGINE_PLUGIN_NAME = "analytics-engine";

export const ANALYTICS_ENGINE_PLUGIN: Plugin<
	typeof AnalyticsEngineSchemaOptionsSchema,
	typeof AnalyticsEngineSchemaSharedOptionsSchema
> = {
	options: AnalyticsEngineSchemaOptionsSchema,
	sharedOptions: AnalyticsEngineSchemaSharedOptionsSchema,
	async getBindings(options) {
		if (!options.analyticsEngineDatasets) {
			return [];
		}

		const bindings = Object.entries(
			options.analyticsEngineDatasets
		).map<Worker_Binding>(([name, config]) => {
			return {
				name,
				wrapped: {
					moduleName: `${ANALYTICS_ENGINE_PLUGIN_NAME}:local-simulator`,
					innerBindings: [
						{
							name: "dataset",
							json: JSON.stringify(config.dataset),
						},
					],
				},
			};
		});
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof AnalyticsEngineSchemaOptionsSchema>) {
		if (!options.analyticsEngineDatasets) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.analyticsEngineDatasets).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices() {
		return [];
	},
	getExtensions({ options }) {
		if (!options.some((o) => o.analyticsEngineDatasets)) {
			return [];
		}
		return [
			{
				modules: [
					{
						name: `${ANALYTICS_ENGINE_PLUGIN_NAME}:local-simulator`,
						esModule: ANALYTICS_ENGINE(),
						internal: true,
					},
				],
			},
		];
	},
};
