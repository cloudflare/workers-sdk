import { autoCompleteSelect } from "../dialogs";
import { listProjects } from "./projects";

export async function promptSelectProject({
	accountId,
}: {
	accountId: string;
}): Promise<string> {
	const projects = await listProjects({ accountId });

	return autoCompleteSelect("Select a project:", {
		choices: projects.map((project) => ({
			title: project.name,
			value: project.name,
		})),
	});
}
