import { processArgument } from "@cloudflare/cli/args";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { getLocations } from "../locations";
import type { Location, LocationID } from "@cloudflare/containers-shared";

const whichLocationQuestion = "Choose where you want to deploy your container";
const whichRegionQuestion =
	"Choose which region you want to deploy your container in";

function plural(word: string, size: number) {
	if (size > 1) {
		return `${word}s`;
	}

	return word;
}

export async function getLocation(
	args: { location?: string },
	options: { skipLocation?: boolean } = {}
): Promise<LocationID | "Skip"> {
	const locations = await getLocations();
	if (
		args.location !== undefined &&
		!locations.find((location) => location.location === args.location)
	) {
		locations.push({
			name: `Other (${args.location})`,
			location: args.location,
			region: "",
		});
	}

	if (args.location !== undefined) {
		const location = await processArgument<string>(args, "location", {
			question: whichLocationQuestion,
			label: "location",
			defaultValue: args.location ?? "",
			type: "select",
			maxItemsPerPage: 6,
			options: locations.map((locationOption) => ({
				label: locationOption.name,
				value: locationOption.location,
			})),
		});

		return location;
	}

	const regionsToLocation: Record<string, Location[]> = {};
	for (const location of locations) {
		regionsToLocation[location.region] ??= [];
		regionsToLocation[location.region].push(location);
	}

	if (options.skipLocation) {
		regionsToLocation["Skip"] = [];
	}

	const region = await inputPrompt({
		question: whichRegionQuestion,
		label: "region",
		defaultValue: args.location ?? "",
		type: "select",
		maxItemsPerPage: 4,
		options: Object.keys(regionsToLocation).map((r) => ({
			value: r,
			label: `${r} ${
				r === "Skip"
					? ""
					: `(${regionsToLocation[r].length} ${plural(
							"location",
							regionsToLocation[r].length
						)})`
			}`,
		})),
	});

	if (region === "Skip") {
		return "Skip";
	}

	const locationsToChoose = regionsToLocation[region];
	const locationToPops: Record<string, Location[]> = {};
	for (const location of locationsToChoose) {
		locationToPops[location.name] ??= [];
		locationToPops[location.name].push(location);
	}

	const location = await inputPrompt({
		question: whichLocationQuestion,
		label: "location",
		defaultValue: args.location ?? "",
		type: "select",
		maxItemsPerPage: 6,
		options: Object.keys(locationToPops).map((locationOption) => ({
			value: locationOption,
			label: locationOption,
		})),
	});

	const pops = locationToPops[location];
	if (pops.length === 1) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return pops.pop()!.location;
	}

	const chosenPop = await inputPrompt({
		question: `There is multiple points of presence in ${location}, which one do you want to be in?`,
		label: "location",
		defaultValue: args.location ?? "",
		type: "select",
		maxItemsPerPage: 6,
		options: pops.map((locationOpt) => ({
			label: `${locationOpt.name} (${locationOpt.location})`,
			value: locationOpt.location,
		})),
	});

	return chosenPop;
}
