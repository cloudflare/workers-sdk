import { spawn } from "node:child_process";
import {
	getEnvironmentVariableFactory,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import { createDatabaseSignature } from "./client";
import type { CreateDatabaseSignature } from "./client";

/**
 * `WRANGLER_PSCALE_BIN` specifies the path to a PlanetScale CLI binary.
 *
 * By default it's `pscale`.
 */
const getPscalePath = getEnvironmentVariableFactory({
	variableName: "WRANGLER_PSCALE_BIN",
	defaultValue() {
		return "pscale";
	},
});

export const hyperdrivePlanetscaleNamespace = createNamespace({
	metadata: {
		description: "Provision Cloudflare-billed PlanetScale databases",
		status: "experimental",
		owner: "Product: Hyperdrive",
	},
});

export const hyperdrivePlanetscaleCreateCommand = createCommand({
	metadata: {
		description:
			"Create a Cloudflare-billed PlanetScale database via the PlanetScale CLI. Arguments after `--` are forwarded to `pscale database create`",
		status: "experimental",
		owner: "Product: Hyperdrive",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the PlanetScale database to create",
		},
		org: {
			type: "string",
			description: "The PlanetScale organization to create the database in",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const { name, org } = args;
		const passthrough = pscalePassthroughArgs(args._);

		const pscalePath = getPscalePath();
		await verifyPscaleInstalled(pscalePath);

		// Fetch the signature only once the CLI is known to be usable, so a missing
		// binary doesn't burn a timestamped signature the user can't spend.
		const signature = await createDatabaseSignature(config, "planetScale");

		logger.log(`🚧 Creating '${name}' on PlanetScale`);
		await runPscaleDatabaseCreate(
			pscalePath,
			name,
			org,
			signature,
			passthrough
		);
	},
});

// `wrangler hyperdrive planetscale create`. Yargs consumes the declared
// positional, leaving the command path followed by anything after `--`.
const commandPathLength = 3;

/**
 * Extracts the arguments to forward verbatim to `pscale database create`.
 *
 * Forwarding rather than re-declaring PlanetScale's flags keeps Wrangler out of
 * the business of tracking their CLI surface.
 *
 * @throws {UserError} If the caller tries to supply the billing proof.
 */
function pscalePassthroughArgs(positionals: (string | number)[]): string[] {
	const passthrough = positionals.slice(commandPathLength).map(String);

	if (
		passthrough.some(
			(arg) =>
				arg === "--cloudflare-billing" ||
				arg.startsWith("--cloudflare-billing=")
		)
	) {
		throw new UserError(
			"`--cloudflare-billing` is set by Wrangler and cannot be passed through.",
			{ telemetryMessage: true }
		);
	}

	return passthrough;
}

export const hyperdrivePlanetscaleSignatureCommand = createCommand({
	metadata: {
		description:
			"Generate a signed authorization for creating a Cloudflare-billed PlanetScale database",
		status: "experimental",
		owner: "Product: Hyperdrive",
	},
	// Print only JSON, so the output can be piped into `pscale database create`.
	behaviour: { printBanner: false },
	args: {},
	async handler(_args, { config }) {
		const signature = await createDatabaseSignature(config, "planetScale");
		logger.log(JSON.stringify(signature, null, 2));
	},
});

/**
 * Runs `pscale database create`, forwarding the Cloudflare billing signature.
 *
 * The child inherits stdio so the PlanetScale CLI owns its own output and can
 * prompt for its OAuth login: wrangler authorizes the Cloudflare billing side
 * only, the user's PlanetScale credentials stay between them and `pscale`.
 *
 * @throws {UserError} If the PlanetScale CLI exits non-zero.
 */
async function runPscaleDatabaseCreate(
	pscalePath: string,
	name: string,
	org: string | undefined,
	signature: CreateDatabaseSignature,
	passthrough: string[]
) {
	// Built field by field rather than re-serialising the response: the
	// PlanetScale CLI rejects unknown fields, so an added response field would
	// otherwise break database creation.
	const billing = JSON.stringify({
		account_id: signature.account_id,
		timestamp: signature.timestamp,
		signature: signature.signature,
	});

	// `@-` reads the payload from stdin, keeping the signature out of the
	// process list where any local user could read it.
	const args = ["database", "create", name, "--cloudflare-billing", "@-"];
	if (org !== undefined) {
		args.push("--org", org);
	}
	args.push(...passthrough);

	const child = spawn(pscalePath, args, {
		stdio: ["pipe", "inherit", "inherit"],
	});

	// The CLI reads stdin to EOF, so the payload must be terminated. A failing
	// child can close the pipe first; the handlers below report that.
	child.stdin.on("error", () => {});
	child.stdin.end(billing);

	await new Promise<void>((resolve, reject) => {
		child.on("error", (err) =>
			reject(
				new UserError(`Failed to run the PlanetScale CLI: ${err.message}`, {
					telemetryMessage: false,
				})
			)
		);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new UserError(
						`The PlanetScale CLI exited with code: ${code}. Your database was not created.`,
						{ telemetryMessage: false }
					)
				);
			}
		});
	});
}

/**
 * Verifies that the PlanetScale CLI can be reached before we depend on it.
 *
 * @throws {UserError} If the binary is missing or does not run.
 */
function verifyPscaleInstalled(pscalePath: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(pscalePath, ["version"], { stdio: "ignore" });

		let settled = false;
		const fail = () => {
			if (settled) {
				return;
			}
			settled = true;
			reject(
				new UserError(
					`The PlanetScale CLI is required to create a PlanetScale database, but \`${pscalePath}\` could not be run.\n` +
						`Install it from https://planetscale.com/docs/reference/planetscale-cli, or set WRANGLER_PSCALE_BIN to its path.\n` +
						"Alternatively, run `wrangler hyperdrive planetscale signature` and pass the values to `pscale database create` yourself.",
					{ telemetryMessage: false }
				)
			);
		};

		child.on("error", fail);
		child.on("close", (code) => {
			if (code === 0) {
				settled = true;
				resolve();
			} else {
				fail();
			}
		});
	});
}
