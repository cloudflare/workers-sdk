import type { StudioResultHeaderMetadata } from "../../components/Studio/Table/StateHelpers";
import type {
	StudioTableState,
	StudioTableStateRow,
} from "../../components/Studio/Table/TableState";
import type {
	IStudioDriver,
	StudioTableRowMutationRequest,
	StudioTableSchema,
} from "../../types/studio";

interface StudioExecutePlan {
	row: StudioTableStateRow;
	plan: StudioTableRowMutationRequest;
}

export async function commitStudioTableChanges({
	driver,
	tableName,
	tableSchema,
	data,
}: {
	driver: IStudioDriver;
	tableName: string;
	tableSchema: StudioTableSchema;
	data: StudioTableState<StudioResultHeaderMetadata>;
}): Promise<{ errorMessage?: string }> {
	const plans = buildStudioMutationPlans({
		tableSchema,
		data,
	});

	try {
		const result = await driver.mutateTableRows(
			tableSchema.schemaName,
			tableName,
			plans.map((p) => p.plan),
			tableSchema
		);

		data.applyChanges(
			plans.map((p, idx) => {
				return {
					row: p.row,
					updated: result[idx]?.record ?? {},
				};
			})
		);
	} catch (e) {
		return { errorMessage: (e as Error).message };
	}

	return {};
}

export function buildStudioMutationPlans({
	tableSchema,
	data,
}: {
	tableSchema: StudioTableSchema;
	data: StudioTableState<StudioResultHeaderMetadata>;
}): StudioExecutePlan[] {
	const rowChangeList = data.getChangedRows();
	const plans: StudioExecutePlan[] = [];

	for (const row of rowChangeList) {
		const rowChange = row.change;
		if (rowChange) {
			const pk = tableSchema.pk;

			const wherePrimaryKey = pk.reduce<Record<string, unknown>>(
				(condition, pkColumnName) => {
					condition[pkColumnName] = row.raw[pkColumnName];
					return condition;
				},
				{}
			);

			if (row.isNewRow) {
				plans.push({
					row,
					plan: {
						operation: "INSERT",
						values: rowChange,
						autoIncrementPkColumn: tableSchema.autoIncrement
							? tableSchema.pk[0]
							: undefined,
						pk: tableSchema.pk,
					},
				});
			} else if (row.isRemoved) {
				plans.push({
					row,
					plan: { operation: "DELETE", where: wherePrimaryKey },
				});
			} else {
				plans.push({
					row,
					plan: {
						operation: "UPDATE",
						where: wherePrimaryKey,
						values: rowChange,
					},
				});
			}
		}
	}

	return plans;
}
