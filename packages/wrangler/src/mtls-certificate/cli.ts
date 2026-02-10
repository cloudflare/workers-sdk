import {
	deleteMTlsCertificate,
	getMTlsCertificate,
	getMTlsCertificateByName,
	listMTlsCertificates,
	uploadMTlsCertificateFromFs,
} from "../api/mtls-certificate";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import type { MTlsCertificateResponse } from "../api/mtls-certificate";

export const mTlsCertificateUploadCommand = createCommand({
	metadata: {
		description: "Upload an mTLS certificate",
		owner: "Product: SSL",
		status: "stable",
	},
	args: {
		cert: {
			describe:
				"The path to a certificate file (.pem) containing a chain of certificates to upload",
			type: "string",
			demandOption: true,
		},
		key: {
			describe:
				"The path to a file containing the private key for your leaf certificate",
			type: "string",
			demandOption: true,
		},
		name: {
			describe: "The name for the certificate",
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
			name: name,
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

export const mTlsCertificateListCommand = createCommand({
	metadata: {
		description: "List uploaded mTLS certificates",
		owner: "Product: SSL",
		status: "stable",
	},
	async handler(_, { config }) {
		const accountId = await requireAuth(config);
		const certificates = await listMTlsCertificates(config, accountId, {});
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
			logger.log("\n");
		}
	},
});

export const mTlsCertificateDeleteCommand = createCommand({
	metadata: {
		description: "Delete an mTLS certificate",
		owner: "Product: SSL",
		status: "stable",
	},
	args: {
		id: {
			describe: "The id of the mTLS certificate to delete",
			type: "string",
		},
		name: {
			describe: "The name of the mTLS certificate record to delete",
			type: "string",
		},
	},
	async handler({ id, name }, { config }) {
		const accountId = await requireAuth(config);
		if (id && name) {
			return logger.error(`Error: can't provide both --id and --name.`);
		} else if (!id && !name) {
			return logger.error(`Error: must provide --id or --name.`);
		}
		let certificate: MTlsCertificateResponse;
		if (id) {
			certificate = await getMTlsCertificate(config, accountId, id);
		} else {
			certificate = await getMTlsCertificateByName(
				config,
				accountId,
				name as string
			);
		}

		const response = await confirm(
			certificate.name
				? `Are you sure you want to delete certificate ${certificate.id} (${certificate.name})?`
				: `Are you sure you want to delete certificate ${certificate.id}?`
		);
		if (!response) {
			logger.log("Not deleting");
			return;
		}

		await deleteMTlsCertificate(config, accountId, certificate.id);

		logger.log(
			certificate.name
				? `Deleted certificate ${certificate.id} (${certificate.name}) successfully`
				: `Deleted certificate ${certificate.id} successfully`
		);
	},
});

export const mTlsCertificateNamespace = createNamespace({
	metadata: {
		description: "🪪 Manage certificates used for mTLS connections",
		owner: "Product: SSL",
		status: "stable",
		category: "Networking & security",
	},
});
