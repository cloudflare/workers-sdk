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
			"--cert-verification-mode is required when providing --certificate-authority or --client-certificate. Choose verify_full, verify_ca, or disabled."
		);
	}
	if (
		args.certVerificationMode !== undefined &&
		!["verify_full", "verify_ca", "disabled"].includes(
			args.certVerificationMode
		)
	) {
		throw new UserError(
			"Invalid --cert-verification-mode. Choose verify_full, verify_ca, or disabled."
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
				`Invalid --${flag}: '${id}'. Provide the certificate UUID returned by wrangler cert upload.`
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
			"--certificate-authority requires --cert-verification-mode verify_ca or verify_full; disabled cannot verify a custom CA."
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
	validateCertificateAuthorityMode(
		request.tls_settings.certificate_authority,
		request.tls_settings.cert_verification_mode
	);
}
