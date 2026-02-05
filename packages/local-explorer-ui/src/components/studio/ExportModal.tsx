import { Button } from "@cloudflare/kumo";
import { useState } from "react";
import {
	exportCSVFromStudioResult,
	exportSQLFromStudioResult,
} from "../../utils/studio/export";
import { Modal } from "../../utils/studio/stubs/ui/Modal";
import { useStudioContext } from "./Context";
import { StudioExportOptionEditor } from "./ExportOptionEditor";
import type { StudioMultipleQueryResult } from "../../utils/studio";
import type { StudioExportOption } from "../../utils/studio/export";

export function StudioExportModal({
	result,
	onClose,
}: {
	result: StudioMultipleQueryResult;
	onClose: () => void;
}) {
	const { driver } = useStudioContext();
	const [error, setError] = useState<string | null>(null);
	const [option, setOption] = useState<StudioExportOption>({
		type: "CSV",
		includeColumnName: true,
		separator: "COMMA",
		lineTerminator: "LF",
		nullValue: "EMPTY_STRING",
		filename: "export.csv",
		batchSize: 10,
		tableName: result.predictedTableName || "unknown",
		maxStatementLength: 10000,
	});

	const handleExport = () => {
		try {
			setError(null);
			if (option.type === "CSV") {
				exportCSVFromStudioResult(result.result, option);
			} else if (option.type === "SQL") {
				exportSQLFromStudioResult(result.result, driver, option);
			}
			onClose();
		} catch (error) {
			if (error instanceof Error) {
				setError(error.message);
			} else {
				setError("An unknown error occurred");
			}
		}
	};

	return (
		<Modal isOpen onClose={onClose} className="max-w-xl z-5">
			<div className="bg-surface space-y-4">
				<h1 className="text-lg font-semibold p-4 border-b border-color">
					Export
				</h1>

				<div className="flex flex-col gap-2 px-4 pb-4">
					<div className="my-2 text-base">
						Choose how you want to export your query result:
					</div>

					<div className="text-base border border-color rounded-lg shadow-xs">
						<StudioExportOptionEditor value={option} onChange={setOption} />
					</div>
				</div>

				{error && (
					<div className="-mt-2 px-4 py-2 text-sm bg-red-100 mx-4 rounded dark:bg-red-900 dark:text-white">
						{error}
					</div>
				)}

				<div className="flex justify-end border-t border-color px-4 py-2">
					<Button variant="primary" size="base" onClick={handleExport}>
						Export
					</Button>
				</div>
			</div>
		</Modal>
	);
}
