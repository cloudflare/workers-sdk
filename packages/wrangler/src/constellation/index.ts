import * as CreateProject from "./createProject";
import * as DeleteProject from "./deleteProject";
import * as DeleteProjectModel from "./deleteProjectModel";
import * as ListCatalog from "./listCatalog";
import * as ListModel from "./listModel";
import * as ListProject from "./listProject";
import * as ListRuntime from "./listRuntime";
import * as UploadModel from "./uploadModel";
import type { CommonYargsArgv } from "../yargs-types";

export function constellation(yargs: CommonYargsArgv) {
	return yargs
		.command("project", "Manage your projects", (constProjYargs) => {
			return constProjYargs
				.command(
					"list",
					"List your projects",
					ListProject.options,
					ListProject.handler
				)
				.command(
					"create <name> <runtime>",
					"Create project",
					CreateProject.options,
					CreateProject.handler
				)
				.command(
					"delete <name>",
					"Delete project",
					DeleteProject.options,
					DeleteProject.handler
				);
		})
		.command("model", "Manage your models", (constModelYargs) => {
			return constModelYargs
				.command(
					"upload <name> <modelName> <modelFile>",
					"Upload a model for an existing project",
					UploadModel.options,
					UploadModel.handler
				)
				.command(
					"list <name>",
					"List models of a project",
					ListModel.options,
					ListModel.handler
				)
				.command(
					"delete <name> <modelName>",
					"Delete a model of a project",
					DeleteProjectModel.options,
					DeleteProjectModel.handler
				);
		})
		.command(
			"catalog",
			"Check the curated model catalog",
			(constCatalogYargs) => {
				return constCatalogYargs.command(
					"list",
					"List catalog models",
					ListCatalog.options,
					ListCatalog.handler
				);
			}
		)
		.command("runtime", "Check the suported runtimes", (constRuntimeYargs) => {
			return constRuntimeYargs.command(
				"list",
				"List suported runtimes",
				ListRuntime.options,
				ListRuntime.handler
			);
		});
}
