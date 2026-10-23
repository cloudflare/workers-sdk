import { UserError } from "@cloudflare/workers-utils";
import type {
	CertVerificationMode,
	ConnectivityService,
	ConnectivityServiceRequest,
} from "./index";

export interface TlsArgs {
	certificateAuthority?: string;
	clientCertificate?: string;
	certVerificationMode?: string;
	removeCertificateAuthority?: boolean;
	removeClientCertificate?: boolean;
}

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
	validateCertificateAuthorityMode(
		args.certificateAuthority,
		args.certVerificationMode
	);
}

function validateCertificateAuthorityMode(
	ca: string | undefined,
	mode: string | undefined
): void {
	if (ca !== undefined && mode === "disabled") {
		throw new UserError(
			"--certificate-authority requires --cert-verification-mode verify_ca or verify_full; disabled cannot verify a custom CA.",
			{
				telemetryMessage:
					"vpc tls certificate authority with disabled verification",
			}
		);
	}
}

export function applyTlsSettings(
	request: ConnectivityServiceRequest,
	args: TlsArgs,
	existing?: ConnectivityService
): void {
	const tls = existing?.tls_settings;
	if (
		args.certificateAuthority === undefined &&
		args.clientCertificate === undefined &&
		args.certVerificationMode === undefined &&
		!args.removeCertificateAuthority &&
		!args.removeClientCertificate
	) {
		request.tls_settings = tls;
		return;
	}
	if (
		!tls &&
		args.certificateAuthority === undefined &&
		args.clientCertificate === undefined &&
		args.certVerificationMode === undefined
	) {
		return;
	}
	request.tls_settings = {
		certificate_authority: args.removeCertificateAuthority
			? undefined
			: (args.certificateAuthority ?? tls?.certificate_authority),
		client_certificate: args.removeClientCertificate
			? undefined
			: (args.clientCertificate ?? tls?.client_certificate),
		cert_verification_mode: (args.certVerificationMode ??
			tls?.cert_verification_mode ??
			"verify_full") as CertVerificationMode,
	};
	const { certificate_authority, cert_verification_mode } =
		request.tls_settings;
	if (
		args.certificateAuthority === undefined &&
		certificate_authority !== undefined &&
		cert_verification_mode === "disabled"
	) {
		throw new UserError(
			`This service uses certificate authority ${certificate_authority}, which requires --cert-verification-mode verify_ca or verify_full. To disable verification, also pass --remove-certificate-authority.`,
			{
				telemetryMessage:
					"vpc tls retained certificate authority with disabled verification",
			}
		);
	}
	validateCertificateAuthorityMode(
		certificate_authority,
		cert_verification_mode
	);
}
