import assert from "assert";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { fetch } from "@miniflare/core";
import { bold, dim, grey, red } from "kleur/colors";
import { OptionalZodTypeOf } from "./helpers";
import { Plugins, IncomingRequestCfPropertiesSchema } from "./plugins";
import { TypeOf } from "zod";
const defaultCfPath = path.resolve("node_modules", ".mf", "cf.json");
const defaultCfFetchEndpoint = "https://workers.cloudflare.com/cf.json";
type IncomingRequestCfProperties = TypeOf<
	typeof IncomingRequestCfPropertiesSchema
>;
const fallbackCf: IncomingRequestCfProperties = {
	asn: 395747,
	colo: "DFW",
	city: "Austin",
	region: "Texas",
	regionCode: "TX",
	metroCode: "635",
	postalCode: "78701",
	country: "US",
	continent: "NA",
	timezone: "America/Chicago",
	latitude: "30.27130",
	longitude: "-97.74260",
	clientTcpRtt: 0,
	httpProtocol: "HTTP/1.1",
	requestPriority: "weight=192;exclusive=0",
	tlsCipher: "AEAD-AES128-GCM-SHA256",
	tlsVersion: "TLSv1.3",
	tlsClientAuth: {
		certIssuerDNLegacy: "",
		certIssuerDN: "",
		certPresented: "0",
		certSubjectDNLegacy: "",
		certSubjectDN: "",
		certNotBefore: "",
		certNotAfter: "",
		certSerial: "",
		certFingerprintSHA1: "",
		certVerified: "NONE",
	},
};
// Milliseconds in 1 day
export const DAY = 86400000;
// Max age in days of cf.json
export const CF_DAYS = 30;

type CoreOptions = OptionalZodTypeOf<Plugins["core"]["sharedOptions"]>;

export async function setupCf(
	cf: CoreOptions["cf"]
): Promise<IncomingRequestCfProperties> {
	if (!(cf ?? process.env.NODE_ENV !== "test")) {
		return fallbackCf;
	}

	if (typeof cf === "object") {
		return cf as IncomingRequestCfProperties;
	}

	let cfPath = defaultCfPath;
	if (typeof cf === "string") {
		cfPath = cf;
	}

	// Try load cfPath, if this fails, we'll catch the error and refetch.
	// If this succeeds, and the file is stale, that's fine: it's very likely
	// we'll be fetching the same data anyways.
	try {
		const storedCf = JSON.parse(await readFile(cfPath, "utf8"));
		const cfStat = await stat(cfPath);
		assert(Date.now() - cfStat.mtimeMs <= CF_DAYS * DAY);
		return storedCf;
	} catch {}

	try {
		const res = await fetch(defaultCfFetchEndpoint);
		const cfText = await res.text();
		const storedCf = JSON.parse(cfText);
		// Write cf so we can reuse it later
		await mkdir(path.dirname(cfPath), { recursive: true });
		await writeFile(cfPath, cfText, "utf8");
		console.log(grey("Updated `Request.cf` object cache!"));
		return storedCf;
	} catch (e: any) {
		console.log(
			bold(
				red(`Unable to fetch the \`Request.cf\` object! Falling back to a default placeholder...
${dim(e.cause ? e.cause.stack : e.stack)}`)
			)
		);
		return fallbackCf;
	}
}
