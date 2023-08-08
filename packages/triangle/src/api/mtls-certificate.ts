import { fetchResult } from "../cfetch";
import { readFileSync } from "../parse";

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
 * supported filters for listing mTLS certificates via the ssl api
 */
export interface MTlsCertificateListFilter {
	name?: string;
}

/**
 * indicates that looking up a certificate by name failed due to zero matching results
 */
export class ErrorMTlsCertificateNameNotFound extends Error {}

/**
 * indicates that looking up a certificate by name failed due to more than one matching results
 */
export class ErrorMTlsCertificateManyNamesMatch extends Error {}

/**
 * reads an mTLS certificate and private key pair from disk and uploads it to the account mTLS certificate store
 */
export async function uploadMTlsCertificateFromFs(
	accountId: string,
	details: MTlsCertificateUploadDetails
): Promise<MTlsCertificateResponse> {
	return await uploadMTlsCertificate(accountId, {
		certificateChain: readFileSync(details.certificateChainFilename),
		privateKey: readFileSync(details.privateKeyFilename),
		name: details.name,
	});
}

/**
 *  uploads an mTLS certificate and private key pair to the account mTLS certificate store
 */
export async function uploadMTlsCertificate(
	accountId: string,
	body: MTlsCertificateBody
): Promise<MTlsCertificateResponse> {
	return await fetchResult(`/accounts/${accountId}/mtls_certificates`, {
		method: "POST",
		body: JSON.stringify({
			name: body.name,
			certificates: body.certificateChain,
			private_key: body.privateKey,
			ca: false,
		}),
	});
}

/**
 *  fetches an mTLS certificate from the account mTLS certificate store by ID
 */
export async function getMTlsCertificate(
	accountId: string,
	id: string
): Promise<MTlsCertificateResponse> {
	return await fetchResult(
		`/accounts/${accountId}/mtls_certificates/${id}`,
		{}
	);
}

/**
 *  lists mTLS certificates for an account. filtering by name is supported
 */
export async function listMTlsCertificates(
	accountId: string,
	filter: MTlsCertificateListFilter
): Promise<MTlsCertificateResponse[]> {
	const params = new URLSearchParams();
	params.append("ca", "false");
	if (filter.name) {
		params.append("name", filter.name);
	}
	return await fetchResult(
		`/accounts/${accountId}/mtls_certificates`,
		{},
		params
	);
}

/**
 *  fetches an mTLS certificate from the account mTLS certificate store by name. will throw an error if no certificates are found, or multiple are found with that name
 */
export async function getMTlsCertificateByName(
	accountId: string,
	name: string
): Promise<MTlsCertificateResponse> {
	const certificates = await listMTlsCertificates(accountId, { name });
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
	accountId: string,
	certificateId: string
) {
	return await fetchResult(
		`/accounts/${accountId}/mtls_certificates/${certificateId}`,
		{ method: "DELETE" }
	);
}
