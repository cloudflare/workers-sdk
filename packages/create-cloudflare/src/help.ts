import { logRaw } from "@cloudflare/cli";
import { blue, bold, brandColor, dim } from "@cloudflare/cli/colors";
import { detectPackageManager } from "helpers/packageManagers";
import indentString from "indent-string";
import wrap from "wrap-ansi";
import { version } from "../package.json";
import type {
	AllowedValueDefinition,
	ArgDefinition,
	ArgumentsDefinition,
	OptionDefinition,
} from "helpers/args";
import type { C3Args } from "types";

const MAX_WIDTH = 100;
const PADDING_RIGHT = 5;

export const showHelp = (
	args: Partial<C3Args> | null,
	{ positionals, options, intro }: ArgumentsDefinition,
) => {
	const { name: pm } = detectPackageManager();

	logRaw(`${brandColor("create-cloudflare")} ${dim("v" + version)}\n`);
	indent(`${intro.trim()}\n`, 1);

	logRaw(bold("USAGE\n"));
	const latest = pm === "yarn" ? "" : "@latest";
	const opts = pm === "npm" ? "-- options" : "options";
	indent(`${pm} create cloudflare${latest} [directory] [${opts}]\n`, 1);

	logRaw(bold("OPTIONS\n"));

	if (args?.experimental) {
		logRaw(
			blue(
				"You have selected experimental mode - the options below are filtered to those that support experimental mode.\n",
			),
		);
	}

	renderPositionals(positionals);
	renderOptions(args, options);
};

/**
 * Indent the provided string by the specified level and write to stdout. Lines
 * will be wrapped to the width of the terminal or a preset maximum width, whichever
 * is smaller.
 *
 * @param str The string to be indented
 * @param level The indentation level
 */
const indent = (str: string, level = 0) => {
	const maxWidth = Math.min(MAX_WIDTH, process.stdout.columns - PADDING_RIGHT);
	logRaw(indentString(wrap(str, maxWidth - level), level, { indent: "  " }));
};

const renderPositionals = (positionals?: ArgDefinition[]) => {
	if (!positionals) {
		return;
	}

	if (positionals) {
		for (const { name, description } of positionals) {
			indent(bold(`${name}`), 1);
			indent(`${description.trim()}\n`, 2);
		}
	}
};

const renderOptions = (
	args: Partial<C3Args> | null,
	options?: OptionDefinition[],
) => {
	if (!options) {
		return;
	}

	for (const option of options) {
		const { name, description, alias, values, type, hidden } = option;
		if (hidden) {
			continue;
		}

		let heading =
			type === "boolean"
				? bold(`--${name}, --no-${name}`)
				: `${bold(`--${name}`)}=<value>`;

		heading = alias ? `${heading}, ${bold(`-${alias}`)}` : heading;

		indent(heading, 1);
		indent(`${description.trim()}\n`, 2);

		renderValues(typeof values === "function" ? values(args) : values);
	}
};

const renderValues = (values?: AllowedValueDefinition[]) => {
	if (!values || !(values.length > 0)) {
		return;
	}

	indent("Allowed Values:\n", 2);

	if (values[0].description) {
		for (const { name, description } of values) {
			indent(`${name}`, 3);
			indent(`${description}`, 4);
		}
		// Newline
		logRaw("");
		return;
	}

	const content = values.map((val) => val.name).join(", ");
	indent(`${content}\n`, 3);
};
