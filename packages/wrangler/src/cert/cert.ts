import {
	deleteMTlsCertificate,
	getMTlsCertificate,
	getMTlsCertificateByName,
	listMTlsCertificates,
	uploadCaCertificateFromFs,
	uploadMTlsCertificateFromFs,
} from "../api/mtls-certificate";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import type { MTlsCertificateResponse } from "../api/mtls-certificate";

// wrangler cert
export const certNamespace = createNamespace({
	metadata: {
		description:
			"🪪 Manage client mTLS certificates and CA certificate chains used for secured connections",
		status: "open beta",
		owner: "Product: SSL",
		category: "Networking & security",
	},
});

export const certUploadNamespace = createNamespace({
	metadata: {
		description: "Upload a new cert",
		status: "open beta",
		owner: "Product: SSL",
	},
});

// wrangler cert upload mtls-certificate
export const certUploadMtlsCommand = createCommand({
	metadata: {
		description: "Upload an mTLS certificate",
		status: "stable",
		owner: "Product: SSL",
	},
	args: {
		cert: {
			description:
				"The path to a certificate file (.pem) containing a chain of certificates to upload",
			type: "string",
			demandOption: true,
		},
		key: {
			description:
				"The path to a file containing the private key for your leaf certificate",
			type: "string",
			demandOption: true,
		},
		name: {
			description: "The name for the certificate",
			type: "string",
		},
	},
	async handler({ cert, key, name }, { config }) {
		const accountId = await requireAuth(config);
		logger.log(
			name
				? `Uploading mTLS Certificate ${name}...`
				: `Uploading mTLS Certificate...`
		);
		const certResponse = await uploadMTlsCertificateFromFs(config, accountId, {
			certificateChainFilename: cert,
			privateKeyFilename: key,
			name,
		});
		const expiresOn = new Date(certResponse.expires_on).toLocaleDateString();
		logger.log(
			name
				? `Success! Uploaded mTLS Certificate ${name}`
				: `Success! Uploaded mTLS Certificate`
		);
		logger.log(`ID: ${certResponse.id}`);
		logger.log(`Issuer: ${certResponse.issuer}`);
		logger.log(`Expires on ${expiresOn}`);
	},
});

// wrangler cert upload ca
export const certUploadCaCertCommand = createCommand({
	metadata: {
		description: "Upload a CA certificate chain",
		status: "stable",
		owner: "Product: SSL",
	},
	args: {
		name: {
			describe: "The name for the certificate",
			type: "string",
		},
		"ca-cert": {
			description:
				"The path to a certificate file (.pem) containing a chain of CA certificates to upload",
			type: "string",
			demandOption: true,
		},
	},
	async handler({ caCert, name }, { config }) {
		const accountId = await requireAuth(config);
		logger.log(
			name
				? `Uploading CA Certificate ${name}...`
				: `Uploading CA Certificate...`
		);
		const certResponse = await uploadCaCertificateFromFs(config, accountId, {
			certificates: caCert,
			ca: true,
			name,
		});
		const expiresOn = new Date(certResponse.expires_on).toLocaleDateString();
		logger.log(
			name
				? `Success! Uploaded CA Certificate ${name}`
				: `Success! Uploaded CA Certificate`
		);
		logger.log(`ID: ${certResponse.id}`);
		logger.log(`Issuer: ${certResponse.issuer}`);
		logger.log(`Expires on ${expiresOn}`);
	},
});

// wrangler cert list
export const certListCommand = createCommand({
	metadata: {
		description: "List uploaded mTLS certificates",
		status: "stable",
		owner: "Product: SSL",
	},
	async handler(_, { config }) {
		const accountId = await requireAuth(config);
		const certificates = await listMTlsCertificates(
			config,
			accountId,
			{},
			true
		);
		for (const certificate of certificates) {
			logger.log(`ID: ${certificate.id}`);
			if (certificate.name) {
				logger.log(`Name: ${certificate.name}`);
			}
			logger.log(`Issuer: ${certificate.issuer}`);
			logger.log(
				`Created on: ${new Date(certificate.uploaded_on).toLocaleDateString()}`
			);
			logger.log(
				`Expires on: ${new Date(certificate.expires_on).toLocaleDateString()}`
			);
			if (certificate.ca) {
				logger.log(`CA: ${certificate.ca}`);
			}
			logger.log("\n");
		}
	},
});

// wrangler cert delete
export const certDeleteCommand = createCommand({
	metadata: {
		description: "Delete an mTLS certificate",
		status: "stable",
		owner: "Product: SSL",
	},
	args: {
		id: {
			description: "The id of the mTLS certificate to delete",
			type: "string",
		},
		name: {
			description: "The name of the mTLS certificate record to delete",
			type: "string",
		},
	},
	async handler({ id, name }, { config }) {
		const accountId = await requireAuth(config);
		if (id && name) {
			return logger.error(`Can't provide both --id and --name.`);
		} else if (!id && !name) {
			return logger.error(`Must provide --id or --name.`);
		}
		let certificate: MTlsCertificateResponse;
		if (id) {
			certificate = await getMTlsCertificate(config, accountId, id);
		} else {
			certificate = await getMTlsCertificateByName(
				config,
				accountId,
				name as string,
				true
			);
		}

		const response = await confirm(
			`Are you sure you want to delete certificate ${certificate.id}${certificate.name ? ` (${certificate.name})` : ""}?`
		);
		if (!response) {
			logger.log("Not deleting");
			return;
		}

		await deleteMTlsCertificate(config, accountId, certificate.id);

		logger.log(
			`Deleted certificate ${certificate.id} ${certificate.name ? `(${certificate.name})` : ""} successfully`
		);
	},
});
