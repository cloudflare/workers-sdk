import type { IStudioDriver, StudioResource } from "../../types/studio";

interface StudioProps {
	/**
	 * The studio driver used to make requests to the database.
	 */
	driver: IStudioDriver;
	/**
	 * Table name to open initially (assumes 'main' schema)
	 */
	initialTable?: string;
	/**
	 * Metadata about the current studio resource.
	 */
	resource: StudioResource;
}

export function Studio({ initialTable }: StudioProps): JSX.Element {
	return <h1>{initialTable ?? "null"}</h1>;
}
