import { mkdirSync } from "node:fs";
import path from "node:path";
import SCRIPT_EMAIL_STORE from "worker:email/email-store";
import { type Service } from "../../runtime";
import { EMAIL_STORE_DISK, EMAIL_STORE_SERVICE_NAME } from "../core/constants";

/**
 * Builds the email store service and the disk-backed storage behind it. Allows
 * the local explorer to record sent/received emails without using the miniflare
 * loopback.
 */

/** DO class name — must match the class exported by email-store.worker.ts. */
const EMAIL_STORE_CLASS_NAME = "EmailStore";
/** Binding name — must match the host worker's `Env.EMAIL_STORE_DO`. */
const EMAIL_STORE_DO_BINDING = "EMAIL_STORE_DO";

export function getEmailStoreServices(tmpPath: string): Service[] {
	const storagePath = path.join(tmpPath, "email-store");
	mkdirSync(storagePath, { recursive: true });

	return [
		{
			name: EMAIL_STORE_DISK,
			disk: { path: storagePath, writable: true },
		},
		{
			name: EMAIL_STORE_SERVICE_NAME,
			worker: {
				compatibilityDate: "2025-03-17",
				modules: [
					{
						name: "email-store.worker.js",
						esModule: SCRIPT_EMAIL_STORE(),
					},
				],
				durableObjectNamespaces: [
					{
						className: EMAIL_STORE_CLASS_NAME,
						uniqueKey: "miniflare-email-store",
						enableSql: true,
						preventEviction: true,
					},
				],
				durableObjectStorage: { localDisk: EMAIL_STORE_DISK },
				bindings: [
					{
						name: EMAIL_STORE_DO_BINDING,
						durableObjectNamespace: { className: EMAIL_STORE_CLASS_NAME },
					},
				],
			},
		},
	];
}
