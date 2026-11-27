import { UserError } from "@cloudflare/workers-utils";
import type { CertVerificationMode, TlsSettings } from "./index";

export interface TlsArgs {
	certificateAuthority?: string;
	clientCertificate?: string;
	certVerificationMode?: string;
}

/**
 * Validates the TLS flags of `vpc service create` and `vpc service update`
 * before any API call.
 *
 * A certificate reference requires an explicit verification mode, and a custom
 * CA cannot be combined with `disabled`, because it is used only to verify the
 * origin certificate.
 *
 * @param args - The TLS flags supplied on the command line.
 * @throws {UserError} If the flags describe invalid TLS settings.
 */
export function validateTlsArgs(args: TlsArgs): void {
	if (
		(args.certificateAuthority !== undefined ||
			args.clientCertificate !== undefined) &&
		args.certVerificationMode === undefined
	) {
		throw new UserError(
			"--cert-verification-mode is required when providing --certificate-authority or --client-certificate. Choose verify_full, verify_ca, or disabled.",
			{ telemetryMessage: "vpc tls missing cert verification mode" }
		);
	}
	if (
		args.certVerificationMode !== undefined &&
		!["verify_full", "verify_ca", "disabled"].includes(
			args.certVerificationMode
		)
	) {
		throw new UserError(
			"Invalid --cert-verification-mode. Choose verify_full, verify_ca, or disabled.",
			{ telemetryMessage: "vpc tls invalid cert verification mode" }
		);
	}
	for (const [flag, id] of [
		["certificate-authority", args.certificateAuthority],
		["client-certificate", args.clientCertificate],
	] as const) {
		if (
			id !== undefined &&
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				id
			)
		) {
			throw new UserError(
				`Invalid --${flag}: '${id}'. Provide the certificate UUID returned by wrangler cert upload.`,
				{ telemetryMessage: `vpc tls invalid ${flag}` }
			);
		}
	}
	if (
		args.certificateAuthority !== undefined &&
		args.certVerificationMode === "disabled"
	) {
		throw new UserError(
			"--certificate-authority requires --cert-verification-mode verify_ca or verify_full; disabled cannot verify a custom CA.",
			{
				telemetryMessage:
					"vpc tls certificate authority with disabled verification",
			}
		);
	}
}

/**
 * Builds the service TLS settings from the command-line flags alone.
 *
 * Service updates replace the whole configuration, so settings omitted here are
 * not carried over from the existing service.
 *
 * @param args - TLS flags that have passed {@link validateTlsArgs}.
 * @returns The TLS settings to send, or `undefined` when no TLS flags were
 * supplied, which leaves the service on the platform defaults.
 */
export function tlsSettingsFromArgs(args: TlsArgs): TlsSettings | undefined {
	if (args.certVerificationMode === undefined) {
		return undefined;
	}
	return {
		cert_verification_mode: args.certVerificationMode as CertVerificationMode,
		certificate_authority: args.certificateAuthority,
		client_certificate: args.clientCertificate,
	};
}
