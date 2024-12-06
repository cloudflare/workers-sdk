import {
	deleteMTlsCertificate,
	getMTlsCertificate,
	getMTlsCertificateByName,
	listMTlsCertificates,
	uploadMTlsCertificateFromFs,
    uploadCaCertificates
} from "../api/mtls-certificate";
import { withConfig } from "../config";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import type { MTlsCertificateResponse } from "../api/mtls-certificate";
import type {
	CommonYargsArgv,
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { BuilderCallback } from "yargs";

function uploadMTlsCertificateOptions(yargs: CommonYargsArgv) {
	return yargs
		.option("cert", {
			describe:
				"The path to a certificate file (.pem) containing a chain of certificates to upload",
			type: "string",
			demandOption: true,
		})
		.option("key", {
			describe:
				"The path to a file containing the private key for your leaf certificate",
			type: "string",
			demandOption: true,
		})
		.option("name", {
			describe: "The name for the certificate",
			type: "string",
		});
}

function uploadCaCertificatesOptions(yargs: CommonYargsArgv) {
	return yargs
		.option("ca-cert", {
			describe:
				"The path to a certificate file (.pem) containing a chain of CA certificates to upload",
			type: "string",
			demandOption: true,
		})
		.option("name", {
			describe: "The name for the certificate",
			type: "string",
		});
}

const uploadMTlsCertificateHandler = withConfig<
	StrictYargsOptionsToInterface<typeof uploadMTlsCertificateOptions>
>(async ({ config, cert, key, name }) => {
	const accountId = await requireAuth(config);
	logger.log(
		name
			? `Uploading mTLS Certificate ${name}...`
			: `Uploading mTLS Certificate...`
	);
	const certResponse = await uploadMTlsCertificateFromFs(accountId, {
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
});

const uploadCaCertificatesHandler = withConfig<
	StrictYargsOptionsToInterface<typeof uploadCaCertificatesOptions>
>(async ({ config, caCert, name }) => {
	const accountId = await requireAuth(config);
	logger.log(
		name
			? `Uploading CA Certificate ${name}...`
			: `Uploading CA Certificate...`
	);
	const certResponse = await uploadCaCertificates(accountId, {
		certificates: caCert,
		ca: true,
		name: name,
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
});

const listMTlsCertificatesHandler = withConfig(async ({ config }) => {
	const accountId = await requireAuth(config);
	const certificates = await listMTlsCertificates(accountId, {});
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
});

function deleteMTlsCertificateOptions(yargs: CommonYargsArgv) {
	return yargs
		.option("id", {
			describe: "The id of the mTLS certificate to delete",
			type: "string",
		})
		.option("name", {
			describe: "The name of the mTLS certificate record to delete",
			type: "string",
		});
}

const deleteMTlsCertificateHandler = withConfig<
	StrictYargsOptionsToInterface<typeof deleteMTlsCertificateOptions>
>(async ({ config, id, name }) => {
	const accountId = await requireAuth(config);
	if (id && name) {
		return logger.error(`Error: can't provide both --id and --name.`);
	} else if (!id && !name) {
		return logger.error(`Error: must provide --id or --name.`);
	}
	let certificate: MTlsCertificateResponse;
	if (id) {
		certificate = await getMTlsCertificate(accountId, id);
	} else {
		certificate = await getMTlsCertificateByName(accountId, name as string);
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

	await deleteMTlsCertificate(accountId, certificate.id);

	logger.log(
		certificate.name
			? `Deleted certificate ${certificate.id} (${certificate.name}) successfully`
			: `Deleted certificate ${certificate.id} successfully`
	);
});

export const certCommands: BuilderCallback<
	CommonYargsOptions,
	unknown
> = (yargs) => {

	yargs.command('upload', 'upload a new cert [mtls-certificate|certificate-authority]', function (yargs) {
		yargs.command(
			'mtls-certificate',
			"Upload an mTLS certificate",
			uploadMTlsCertificateOptions,
			uploadMTlsCertificateHandler
		);

		yargs.command(
			'certificate-authority',
			"Upload a CA certificate chain",
			uploadCaCertificatesOptions,
			uploadCaCertificatesHandler
		);
	});


	yargs.command(
		"list",
		"List uploaded mTLS certificates",
		(a) => a,
		listMTlsCertificatesHandler
	);

	yargs.command(
		"delete",
		"Delete an mTLS certificate",
		deleteMTlsCertificateOptions,
		deleteMTlsCertificateHandler
	);
};
