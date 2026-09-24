import {
	call,
	camelObject,
	getRecord,
	getRecords,
	getStrings,
	hasOwn,
	isRecord,
	optionsFromRecord,
	type UnknownRecord,
} from "./converter-helpers";
import { createFollowUp } from "./follow-ups";
import type { MigrationFollowUp, OutputProperty, OutputValue } from "./types";

export function convertTriggers(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): { domains?: string[]; triggers?: OutputValue[] } {
	const domains: string[] = [];
	const converted: OutputValue[] = [];
	const routes: unknown[] = [
		...(hasOwn(source, "route") ? [source.route] : []),
		...(Array.isArray(source.routes) ? source.routes : []),
	];

	for (const [index, route] of routes.entries()) {
		if (typeof route === "string") {
			imports.add("triggers");
			converted.push(
				call("triggers.fetch", {
					kind: "object",
					properties: [
						{
							key: "pattern",
							value: route,
						},
					],
				})
			);
			continue;
		}

		if (!isRecord(route) || typeof route.pattern !== "string") {
			report(
				createFollowUp(
					"invalid-route",
					"A Wrangler route could not be migrated.",
					{ sourcePath: `${sourcePrefix || "config"}.routes.${index}` }
				)
			);
			continue;
		}

		if (route.custom_domain === true) {
			domains.push(route.pattern);

			if (
				hasOwn(route, "enabled") ||
				hasOwn(route, "previews_enabled") ||
				hasOwn(route, "zone_id") ||
				hasOwn(route, "zone_name")
			) {
				report(
					createFollowUp(
						"custom-domain-options",
						"Custom-domain route options require manual review.",
						{ sourcePath: `${sourcePrefix || "config"}.routes.${index}` }
					)
				);
			}

			continue;
		}

		imports.add("triggers");

		const options: OutputProperty[] = [
			{
				key: "pattern",
				value: route.pattern,
			},
		];
		if (typeof route.zone_name === "string") {
			options.push({
				key: "zone",
				value: route.zone_name,
			});
		} else if (typeof route.zone_id === "string") {
			options.push({
				key: "zone",
				value: route.zone_id,
			});
			report(
				createFollowUp(
					"zone-id-route",
					"A route uses a zone ID. Verify the generated fetch trigger target.",
					{ sourcePath: `${sourcePrefix || "config"}.routes.${index}` }
				)
			);
		}
		converted.push(
			call("triggers.fetch", {
				kind: "object",
				properties: options,
			})
		);
	}

	const triggerConfig = getRecord(source, "triggers");
	if (triggerConfig) {
		for (const schedule of getStrings(triggerConfig, "crons")) {
			imports.add("triggers");
			converted.push(
				call("triggers.scheduled", {
					kind: "object",
					properties: [
						{
							key: "schedule",
							value: schedule,
						},
					],
				})
			);
		}

		if (
			Array.isArray(triggerConfig.events) &&
			triggerConfig.events.length > 0
		) {
			report(
				createFollowUp(
					"artifact-event-triggers",
					"Artifact event triggers are not supported by the new config and were not migrated.",
					{ sourcePath: `${sourcePrefix || "config"}.triggers.events` }
				)
			);
		}
	}

	const queues = getRecord(source, "queues");
	if (queues) {
		for (const consumer of getRecords(queues, "consumers")) {
			imports.add("triggers");
			converted.push(
				call(
					"triggers.queue",
					optionsFromRecord(consumer, [
						["dead_letter_queue", "deadLetterQueue"],
						["max_batch_size", "maxBatchSize"],
						["max_batch_timeout", "maxBatchTimeout"],
						["max_concurrency", "maxConcurrency"],
						["max_retries", "maxRetries"],
						["queue", "name"],
						["retry_delay", "retryDelay"],
						["visibility_timeout_ms", "visibilityTimeoutMs"],
					])
				)
			);
		}
	}

	for (const connection of getRecords(source, "connect")) {
		imports.add("triggers");
		converted.push(call("triggers.connect", camelObject(connection)));
	}

	const addresses = getStrings(source, "addresses");
	if (Array.isArray(source.addresses)) {
		imports.add("triggers");
		converted.push(
			call("triggers.email", {
				kind: "object",
				properties: [
					{
						key: "addresses",
						value: addresses,
					},
				],
			})
		);
	}

	return {
		domains: domains.length > 0 ? domains : undefined,
		triggers: converted.length > 0 ? converted : undefined,
	};
}
