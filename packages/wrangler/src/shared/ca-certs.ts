import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

// null = not yet computed, undefined = computed but no certs
let cached: string[] | undefined | null = null;

/**
 * Read NODE_EXTRA_CA_CERTS and return combined CA certificates for undici.
 *
 * Node's built-in fetch/https respects NODE_EXTRA_CA_CERTS automatically,
 * but wrangler imports fetch from undici directly. Bundled undici uses its
 * own TLS config and does not read this env var. This bridges the gap.
 *
 * Result is memoized — safe to call from multiple entry points without
 * redundant filesystem reads.
 *
 * @returns Combined root + extra CA certs, or undefined if not configured.
 */
export function getNodeExtraCaCerts(): string[] | undefined {
	if (cached !== null) {
		return cached;
	}

	const extraCertsPath = process.env.NODE_EXTRA_CA_CERTS;
	if (!extraCertsPath) {
		cached = undefined;
		return undefined;
	}

	try {
		const extra = readFileSync(extraCertsPath, "utf8");
		// Split PEM bundle into individual certificates (same regex as miniflare)
		const certs = extra.match(
			/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
		);
		if (certs === null) {
			process.emitWarning(
				`NODE_EXTRA_CA_CERTS (${extraCertsPath}) contains no PEM certificates`,
				"WranglerWarning"
			);
			cached = undefined;
			return undefined;
		}
		cached = [...rootCertificates, ...certs];
		return cached;
	} catch (err) {
		process.emitWarning(
			`Failed to read NODE_EXTRA_CA_CERTS from ${extraCertsPath}: ${err instanceof Error ? err.message : String(err)}`,
			"WranglerWarning"
		);
		cached = undefined;
		return undefined;
	}
}
