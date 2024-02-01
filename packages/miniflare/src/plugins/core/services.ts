import { z } from "zod";
import { Request, Response } from "../../http";
import {
	ExternalServer,
	HttpOptions_Style,
	TlsOptions_Version,
} from "../../runtime";
import { zAwaitable } from "../../shared";

// Zod validators for types in runtime/config/workerd.ts.
// All options should be optional except where specifically stated.
// TODO: autogenerate these with runtime/config/workerd.ts from capnp

// Service binding designator that always points to the worker with the binding.
// Using `Symbol.for()` instead of `Symbol()` in case multiple copies of
// `miniflare` are loaded (e.g. when configuring Vitest and when running pool)
export const kCurrentWorker = Symbol.for("miniflare.kCurrentWorker");

export const HttpOptionsHeaderSchema = z.object({
	name: z.string(), // name should be required
	value: z.ostring(), // If omitted, the header will be removed
});
const HttpOptionsSchema = z.object({
	style: z.nativeEnum(HttpOptions_Style).optional(),
	forwardedProtoHeader: z.ostring(),
	cfBlobHeader: z.ostring(),
	injectRequestHeaders: HttpOptionsHeaderSchema.array().optional(),
	injectResponseHeaders: HttpOptionsHeaderSchema.array().optional(),
});

const TlsOptionsKeypairSchema = z.object({
	privateKey: z.ostring(),
	certificateChain: z.ostring(),
});

const TlsOptionsSchema = z.object({
	keypair: TlsOptionsKeypairSchema.optional(),
	requireClientCerts: z.oboolean(),
	trustBrowserCas: z.oboolean(),
	trustedCertificates: z.string().array().optional(),
	minVersion: z.nativeEnum(TlsOptions_Version).optional(),
	cipherList: z.ostring(),
});

const NetworkSchema = z.object({
	allow: z.string().array().optional(),
	deny: z.string().array().optional(),
	tlsOptions: TlsOptionsSchema.optional(),
});

export const ExternalServerSchema = z.intersection(
	z.object({ address: z.string() }), // address should be required
	z.union([
		z.object({ http: z.optional(HttpOptionsSchema) }),
		z.object({
			https: z.optional(
				z.object({
					options: HttpOptionsSchema.optional(),
					tlsOptions: TlsOptionsSchema.optional(),
					certificateHost: z.ostring(),
				})
			),
		}),
	])
) as z.ZodType<ExternalServer>;
// This type cast is required for `api-extractor` to produce a `.d.ts` rollup.
// Rather than outputting a `z.ZodIntersection<...>` for this type, it will
// just use `z.ZodType<ExternalServer>`. Without this, the extractor process
// just ends up pinned at 100% CPU. Probably unbounded recursion? I guess this
// type is too complex? Something to investigate... :thinking_face:

const DiskDirectorySchema = z.object({
	path: z.string(), // path should be required
	writable: z.oboolean(),
});

export const ServiceFetchSchema = z
	.function()
	.args(z.instanceof(Request))
	.returns(zAwaitable(z.instanceof(Response)));

export const ServiceDesignatorSchema = z.union([
	z.string(),
	z.literal(kCurrentWorker),
	z.object({ network: NetworkSchema }),
	z.object({ external: ExternalServerSchema }),
	z.object({ disk: DiskDirectorySchema }),
	ServiceFetchSchema,
]);
