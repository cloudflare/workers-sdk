import { Button, Dialog } from "@cloudflare/kumo";
import { useState } from "react";
import {
	exportCSVFromStudioResult,
	exportSQLFromStudioResult,
} from "../../../../utils/studio/export";
import { useStudioContext } from "../../Context";
import { StudioExportOptionEditor } from "./OptionsEditor";
import type {
	StudioExportOption,
	StudioMultipleQueryResult,
} from "../../../../types/studio";

interface StudioExportModalProps {
	closeModal: () => void;
	isOpen: boolean;
	result: StudioMultipleQueryResult;
}

export function StudioExportModal({
	closeModal,
	isOpen,
	result,
}: StudioExportModalProps): JSX.Element {
	const { driver } = useStudioContext();

	const [error, setError] = useState<string | null>(null);
	const [option, setOption] = useState<StudioExportOption>({
		batchSize: 10,
		filename: "export.csv",
		includeColumnName: true,
		lineTerminator: "LF",
		maxStatementLength: 10000,
		nullValue: "EMPTY_STRING",
		separator: "COMMA",
		tableName: result.predictedTableName || "unknown",
		type: "CSV",
	});

	function handleExport(): void {
		try {
			setError(null);

			switch (option.type) {
				case "CSV": {
					exportCSVFromStudioResult(result.result, option);
					break;
				}
				case "SQL": {
					exportSQLFromStudioResult(result.result, driver, option);
					break;
				}
			}

			closeModal();
		} catch (err) {
			if (err instanceof Error) {
				setError(err.message);
				return;
			}

			setError("An unknown error occurred");
		}
	}

	return (
		<Dialog.Root
			onOpenChange={(open): void => {
				if (!open) {
					closeModal();
				}
			}}
			open={isOpen}
		>
			<Dialog className="p-6" size="lg">
				<div className="mb-4 flex items-start justify-between gap-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold">Export</Dialog.Title>
				</div>

				{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
				<Dialog.Description className="text-sm text-kumo-subtle">
					Choose how you want to export your query result:
				</Dialog.Description>

				<div className="mt-4 flex flex-col gap-4">
					<div className="rounded-lg border border-border text-base shadow-xs">
						<StudioExportOptionEditor value={option} onChange={setOption} />
					</div>

					{error && (
						<div className="rounded-md bg-red-50 p-3 text-red-700 dark:bg-red-900 dark:text-white">
							{error}
						</div>
					)}
				</div>

				<div className="mt-4 flex justify-end gap-2">
					<Button variant="secondary" onClick={closeModal}>
						Cancel
					</Button>
					<Button variant="primary" onClick={handleExport}>
						Export
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
