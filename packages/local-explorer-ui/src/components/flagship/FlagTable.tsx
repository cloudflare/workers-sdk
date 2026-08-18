import { Badge, Button, DropdownMenu, Table } from "@cloudflare/kumo";
import {
	DotsThreeIcon,
	FlaskIcon,
	PowerIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { timeAgo } from "../workflows/helpers";
import type { FlagshipFlag } from "../../api";
import type { JSX } from "react";

interface FlagTableProps {
	flags: FlagshipFlag[];
	onDelete: (flag: FlagshipFlag) => void;
	onTest: (flag: FlagshipFlag) => void;
	onToggle: (flag: FlagshipFlag) => void;
	pendingKey: string | null;
}

const TYPE_LABELS = {
	boolean: "Boolean",
	json: "JSON",
	number: "Number",
	string: "String",
} as const;

function StatusBadge({ enabled }: { enabled: boolean }): JSX.Element {
	return (
		<Badge className="inline-flex items-center gap-1.5" variant="outline">
			<span
				aria-hidden="true"
				className={`size-1.5 rounded-full ${
					enabled ? "bg-kumo-success" : "bg-kumo-subtle"
				}`}
			/>
			{enabled ? "Enabled" : "Disabled"}
		</Badge>
	);
}

interface ActionMenuProps {
	enabled: boolean;
	onDelete: () => void;
	onTest: () => void;
	onToggle: () => void;
	pending: boolean;
}

function ActionMenu({
	enabled,
	onDelete,
	onTest,
	onToggle,
	pending,
}: ActionMenuProps): JSX.Element {
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<Button
						aria-label="Actions"
						className="h-7! w-7!"
						disabled={pending}
						shape="square"
						variant="ghost"
					>
						<DotsThreeIcon size={16} weight="bold" />
					</Button>
				}
			/>
			<DropdownMenu.Content align="end" sideOffset={4}>
				<DropdownMenu.Item className="flex items-center gap-2" onClick={onTest}>
					<FlaskIcon />
					<span>Test flag</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item
					className="flex items-center gap-2"
					onClick={onToggle}
				>
					<PowerIcon />
					<span>{enabled ? "Disable" : "Enable"}</span>
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item
					className="flex items-center gap-2 text-kumo-danger"
					onClick={onDelete}
				>
					<TrashIcon />
					<span>Delete</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

/**
 * Compact flag list modelled on the Flagship dashboard table.
 *
 * @param props The flags and row actions.
 * @returns The table.
 */
export function FlagTable({
	flags,
	onDelete,
	onTest,
	onToggle,
	pendingKey,
}: FlagTableProps): JSX.Element {
	return (
		<div className="overflow-x-auto rounded-lg border border-kumo-fill bg-kumo-base">
			<Table>
				<Table.Header>
					<Table.Row>
						<Table.Head className="w-2/5">Flag key</Table.Head>
						<Table.Head>Type</Table.Head>
						<Table.Head>Default</Table.Head>
						<Table.Head>Rules</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Modified</Table.Head>
						<Table.Head className="w-12">
							<span className="sr-only">Actions</span>
						</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{flags.map((flag) => {
						const key = flag.key ?? "";
						return (
							<Table.Row className="group" key={key}>
								<Table.Cell>
									<code className="font-medium text-kumo-default">{key}</code>
								</Table.Cell>
								<Table.Cell>
									{flag.type === undefined ? (
										<span className="text-kumo-subtle">—</span>
									) : (
										<Badge variant="secondary">{TYPE_LABELS[flag.type]}</Badge>
									)}
								</Table.Cell>
								<Table.Cell className="font-mono text-[13px] text-kumo-default">
									{flag.default_variation ?? "—"}
								</Table.Cell>
								<Table.Cell className="text-kumo-subtle tabular-nums">
									{flag.rules?.length ?? 0}
								</Table.Cell>
								<Table.Cell>
									<StatusBadge enabled={flag.enabled === true} />
								</Table.Cell>
								<Table.Cell className="text-sm whitespace-nowrap text-kumo-subtle">
									{timeAgo(flag.updated_at) || "just now"}
								</Table.Cell>
								<Table.Cell className="text-right whitespace-nowrap">
									<ActionMenu
										enabled={flag.enabled === true}
										onDelete={() => onDelete(flag)}
										onTest={() => onTest(flag)}
										onToggle={() => onToggle(flag)}
										pending={pendingKey === key}
									/>
								</Table.Cell>
							</Table.Row>
						);
					})}
				</Table.Body>
			</Table>
		</div>
	);
}
