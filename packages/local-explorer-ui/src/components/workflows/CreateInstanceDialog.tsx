import { Button, Dialog } from "@cloudflare/kumo";
import { useCallback, useState } from "react";
import { workflowsCreateInstance } from "../../api";

interface CreateWorkflowInstanceDialogProps {
	onCreated: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	workflowName: string;
}

export function CreateWorkflowInstanceDialog({
	onCreated,
	onOpenChange,
	open,
	workflowName,
}: CreateWorkflowInstanceDialogProps): JSX.Element {
	const [creating, setCreating] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [instanceId, setInstanceId] = useState<string>("");
	const [params, setParams] = useState<string>("");
	const [paramsError, setParamsError] = useState<string | null>(null);

	const resetForm = useCallback(() => {
		setInstanceId("");
		setParams("");
		setError(null);
		setParamsError(null);
	}, []);

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen) {
			resetForm();
		}
		onOpenChange(newOpen);
	}

	function parseParams(): { valid: true; value: unknown } | { valid: false } {
		if (!params.trim()) {
			setParamsError(null);
			return { valid: true, value: undefined };
		}
		try {
			const parsed = JSON.parse(params) as unknown;
			setParamsError(null);
			return { valid: true, value: parsed };
		} catch {
			setParamsError("Invalid JSON");
			return { valid: false };
		}
	}

	async function handleCreate(): Promise<void> {
		const result = parseParams();
		if (!result.valid) {
			return;
		}

		setCreating(true);
		setError(null);

		try {
			const body: { id?: string; params?: unknown } = {};
			if (instanceId.trim()) {
				body.id = instanceId.trim();
			}
			if (result.value !== undefined) {
				body.params = result.value;
			}

			await workflowsCreateInstance({
				path: { workflow_name: workflowName },
				body,
			});

			resetForm();
			onCreated();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create instance"
			);
		} finally {
			setCreating(false);
		}
	}

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog size="lg">
				{/* Header */}
				<div className="border-b border-border px-6 pt-6 pb-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-text">
						Trigger this workflow?
					</Dialog.Title>
					<p className="mt-1 text-sm text-text-secondary">
						Manually trigger an instance of this Workflow using the payload
						below.
					</p>
				</div>

				{/* Body */}
				<div className="px-6 py-6">
					{error && (
						<div className="mb-5 rounded-lg border border-danger/20 bg-danger/8 p-3 text-sm text-danger">
							{error}
						</div>
					)}

					{/* Instance ID */}
					<div className="mb-5">
						<label className="mb-2 block text-sm font-medium text-text">
							Instance ID{" "}
							<span className="font-normal text-text-secondary">
								(optional)
							</span>
						</label>
						<input
							className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text placeholder-text-secondary! focus:border-primary focus:shadow-focus-primary focus:outline-none"
							onChange={(e) => setInstanceId(e.target.value)}
							placeholder="Auto-generated UUID if empty"
							type="text"
							value={instanceId}
						/>
					</div>

					{/* Params */}
					<div>
						<label className="mb-2 block text-sm font-medium text-text">
							Params
						</label>
						<textarea
							className={`w-full resize-y rounded-lg border bg-bg px-3 py-2.5 font-mono text-sm text-text placeholder-text-secondary! focus:shadow-focus-primary focus:outline-none ${
								paramsError
									? "border-danger focus:border-danger"
									: "border-border focus:border-primary"
							}`}
							onChange={(e) => {
								setParams(e.target.value);
								if (paramsError) {
									setParamsError(null);
								}
							}}
							placeholder='{"key": "value"}'
							rows={8}
							value={params}
						/>
						{paramsError ? (
							<p className="mt-1 text-xs text-danger">{paramsError}</p>
						) : (
							<p className="mt-1 text-xs text-text-secondary">
								JSON payload passed to the workflow
							</p>
						)}
					</div>
				</div>

				{/* Footer */}
				<div className="flex justify-end gap-2 border-t border-border px-6 py-4">
					<Button
						variant="secondary"
						onClick={() => handleOpenChange(false)}
						disabled={creating}
					>
						Cancel
					</Button>

					<Button
						variant="primary"
						disabled={creating}
						loading={creating}
						onClick={handleCreate}
					>
						{creating ? "Triggering..." : "Trigger Instance"}
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
