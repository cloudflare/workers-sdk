import { bold, dim, red, yellow } from "@cloudflare/cli-shared-helpers/colors";
import { logger } from "../../shared/context";
import type {
	ExportsReconciliationErrorDetail,
	ExportsReconciliationResult,
} from "@cloudflare/workers-utils";

/**
 * Render the success-side `exports_reconciliation` envelope to the logger.
 * Emits nothing when the result has no entries to report (so a re-deploy
 * with no DO changes doesn't add noise to the deploy output).
 *
 * Warnings are rendered prominently; info and removable-entry hints are lower
 * visibility.
 */
export function renderExportsReconciliationSuccess(
	result: ExportsReconciliationResult
): void {
	const hasAnyContent =
		result.created.length > 0 ||
		result.updated.length > 0 ||
		result.deleted.length > 0 ||
		result.renamed.length > 0 ||
		result.transferred.length > 0 ||
		result.transfer_pending.length > 0 ||
		result.warnings.length > 0 ||
		result.info.length > 0 ||
		result.removable_entries.length > 0;

	if (!hasAnyContent) {
		return;
	}

	logger.log("");
	logger.log(bold("Durable Object exports reconciliation:"));

	if (result.created.length > 0) {
		logger.log(`  Created: ${result.created.join(", ")}`);
	}
	if (result.updated.length > 0) {
		logger.log(`  Updated: ${result.updated.join(", ")}`);
	}
	if (result.deleted.length > 0) {
		logger.log(`  Deleted: ${result.deleted.join(", ")}`);
	}
	if (result.renamed.length > 0) {
		const renames = result.renamed.map((r) => `${r.from} → ${r.to}`).join(", ");
		logger.log(`  Renamed: ${renames}`);
	}

	for (const t of result.transferred) {
		logger.log(`  Transferred (${t.phase}): ${t.class} → ${t.to}`);
	}
	for (const t of result.transfer_pending) {
		logger.log(`  Transfer pending: ${t.class} ← ${t.from}`);
	}

	if (result.warnings.length > 0) {
		logger.log("");
		logger.warn(bold("  Warnings:"));
		for (const w of result.warnings) {
			logger.warn(yellow(`    [${w.scenario}] ${w.class}: ${w.message}`));
		}
	}

	if (result.info.length > 0) {
		logger.log("");
		logger.log(dim("  Info:"));
		for (const info of result.info) {
			let line = dim(`    [${info.scenario}] ${info.class}: ${info.message}`);
			if (info.referencing_scripts && info.referencing_scripts.length > 0) {
				line += dim(` (referenced by: ${info.referencing_scripts.join(", ")})`);
			}
			logger.log(line);
		}
	}

	if (result.removable_entries.length > 0) {
		logger.log("");
		logger.log(
			dim(
				`  Safe to remove from \`exports\`: ${result.removable_entries.join(", ")}`
			)
		);
	}

	logger.log("");
}

/**
 * Format the structured reconciliation error details from the upload error
 * envelope's `meta.details` field. Returns a multi-line string suitable for
 * inclusion in a `UserError`'s message or notes. Each per-class entry is
 * rendered with a red ✘ prefix, the scenario tag, the message, and any
 * optional suggestion / referencing-scripts metadata.
 */
export function renderExportsReconciliationError(
	details: ExportsReconciliationErrorDetail[]
): string {
	const lines: string[] = ["Durable Object exports reconciliation failed:"];
	for (const detail of details) {
		lines.push(
			red(`  ✘ [${detail.scenario}] class '${detail.class}': ${detail.message}`)
		);
		if (detail.suggestion) {
			lines.push(`      Suggestion: ${detail.suggestion}`);
		}
		if (detail.referencing_scripts && detail.referencing_scripts.length > 0) {
			lines.push(
				`      Referencing scripts: ${detail.referencing_scripts.join(", ")}`
			);
		}
	}
	return lines.join("\n");
}

/**
 * Type guard for `meta.details` extracted from an `APIError`'s `meta` field.
 * Validate the array shape so the renderer can rely on the typed fields.
 */
export function isExportsReconciliationErrorDetails(
	value: unknown
): value is ExportsReconciliationErrorDetail[] {
	if (!Array.isArray(value)) {
		return false;
	}
	for (const entry of value) {
		if (
			typeof entry !== "object" ||
			entry === null ||
			typeof (entry as Record<string, unknown>).class !== "string" ||
			typeof (entry as Record<string, unknown>).scenario !== "string" ||
			typeof (entry as Record<string, unknown>).message !== "string"
		) {
			return false;
		}
	}
	return true;
}
