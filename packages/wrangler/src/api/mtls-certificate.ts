import { readFileSync, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * the representation of an mTLS certificate in the account certificate store
 */
export interface MTlsCertificateResponse {
	id: string;
	name?: string;
	ca: boolean;
	certificates: string;
	expires_on: string;
	issuer: string;
	serial_number: string;
	signature: string;
	uploaded_on: string;
}

/**
 * details for uploading an mTLS certificate from disk
 */
export interface MTlsCertificateUploadDetails {
	certificateChainFilename: string;
	privateKeyFilename: string;
	name?: string;
}

/**
 * details for uploading an mTLS certificate via the ssl api
 */
export interface MTlsCertificateBody {
	certificateChain: string;
	privateKey: string;
	name?: string;
}

/**
 * details for uploading an CA certificate or CA chain via the ssl api
 */
export interface CaCertificateBody {
	certificates: string;
	ca: boolean;
	name?: string;
}

/**
 * supported filters for listing mTLS certificates via the ssl api
 */
export interface MTlsCertificateListFilter {
	name?: string;
}

/**
 * indicates that looking up a certificate by name failed due to zero matching results
 */
class ErrorMTlsCertificateNameNotFound extends UserError {}

/**
 * indicates that looking up a certificate by name failed due to more than one matching results
 */
class ErrorMTlsCertificateManyNamesMatch extends UserError {}

/**
 * reads an mTLS certificate and private key pair from disk and uploads it to the account mTLS certificate store
 */
export async function uploadMTlsCertificateFromFs(
	complianceConfig: ComplianceConfig,
	accountId: string,
	details: MTlsCertificateUploadDetails
): Promise<MTlsCertificateResponse> {
	return await uploadMTlsCertificate(complianceConfig, accountId, {
		certificateChain: readFileSync(details.certificateChainFilename),
		privateKey: readFileSync(details.privateKeyFilename),
		name: details.name,
	});
}

/**
 * reads an CA certificate from disk and uploads it to the account mTLS certificate store
 */
export async function uploadCaCertificateFromFs(
	complianceConfig: ComplianceConfig,
	accountId: string,
	details: CaCertificateBody
): Promise<MTlsCertificateResponse> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/mtls_certificates`,
		{
			method: "POST",
			body: JSON.stringify({
				name: details.name,
				certificates: readFileSync(details.certificates),
				ca: details.ca,
			}),
		}
	);
}

/**
 *  uploads an mTLS certificate and private key pair to the account mTLS certificate store
 */
export async function uploadMTlsCertificate(
	complianceConfig: ComplianceConfig,
	accountId: string,
	body: MTlsCertificateBody
): Promise<MTlsCertificateResponse> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/mtls_certificates`,
		{
			method: "POST",
			body: JSON.stringify({
				name: body.name,
				certificates: body.certificateChain,
				private_key: body.privateKey,
				ca: false,
			}),
		}
	);
}

/**
 *  fetches an mTLS certificate from the account mTLS certificate store by ID
 */
export async function getMTlsCertificate(
	complianceConfig: ComplianceConfig,
	accountId: string,
	id: string
): Promise<MTlsCertificateResponse> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/mtls_certificates/${id}`,
		{}
	);
}

/**
 *  lists mTLS certificates for an account. filtering by name is supported
 */
export async function listMTlsCertificates(
	complianceConfig: ComplianceConfig,
	accountId: string,
	filter: MTlsCertificateListFilter,
	ca: boolean = false
): Promise<MTlsCertificateResponse[]> {
	const params = new URLSearchParams();
	if (!ca) {
		params.append("ca", String(false));
	}
	if (filter.name) {
		params.append("name", filter.name);
	}
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/mtls_certificates`,
		{},
		params
	);
}

/**
 *  fetches an mTLS certificate from the account mTLS certificate store by name. will throw an error if no certificates are found, or multiple are found with that name
 */
export async function getMTlsCertificateByName(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string,
	ca: boolean = false
): Promise<MTlsCertificateResponse> {
	const certificates = await listMTlsCertificates(
		complianceConfig,
		accountId,
		{ name },
		ca
	);
	if (certificates.length === 0) {
		throw new ErrorMTlsCertificateNameNotFound(
			`certificate not found with name "${name}"`
		);
	}
	if (certificates.length > 1) {
		throw new ErrorMTlsCertificateManyNamesMatch(
			`multiple certificates found with name "${name}"`
		);
	}
	const certificate = certificates[0];
	return certificate;
}

export async function deleteMTlsCertificate(
	complianceConfig: ComplianceConfig,
	accountId: string,
	certificateId: string
) {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/mtls_certificates/${certificateId}`,
		{ method: "DELETE" }
	);
}
