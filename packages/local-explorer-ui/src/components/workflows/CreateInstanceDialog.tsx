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
				<div className="border-b border-kumo-fill px-6 pt-6 pb-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-kumo-default">
						Trigger this workflow?
					</Dialog.Title>
					<p className="mt-1 text-sm text-kumo-subtle">
						Manually trigger an instance of this Workflow using the payload
						below.
					</p>
				</div>

				{/* Body */}
				<div className="px-6 py-6">
					{error && (
						<div className="mb-5 rounded-lg border border-kumo-danger/20 bg-kumo-danger/8 p-3 text-sm text-kumo-danger">
							{error}
						</div>
					)}

					{/* Instance ID */}
					<div className="mb-5">
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							Instance ID{" "}
							<span className="font-normal text-kumo-subtle">(optional)</span>
						</label>
						<input
							className="focus-visible:ring-kumo-ring w-full rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2.5 text-sm text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none focus-visible:ring-2"
							onChange={(e) => setInstanceId(e.target.value)}
							placeholder="Auto-generated UUID if empty"
							type="text"
							value={instanceId}
						/>
					</div>

					{/* Params */}
					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							Params
						</label>
						<textarea
							className={`focus-visible:ring-kumo-ring w-full resize-y rounded-lg border bg-kumo-base px-3 py-2.5 font-mono text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus-visible:ring-2 ${
								paramsError
									? "border-kumo-danger focus:border-kumo-danger"
									: "border-kumo-fill focus:border-kumo-brand"
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
							<p className="mt-1 text-xs text-kumo-danger">{paramsError}</p>
						) : (
							<p className="mt-1 text-xs text-kumo-subtle">
								JSON payload passed to the workflow
							</p>
						)}
					</div>
				</div>

				{/* Footer */}
				<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
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
