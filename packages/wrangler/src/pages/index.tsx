/* eslint-disable no-shadow */

import { render, Text } from "ink";
import SelectInput from "ink-select-input";
import Table from "ink-table";
import React from "react";
import { format as timeagoFormat } from "timeago.js";
import { fetchResult } from "../cfetch";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { FatalError } from "../errors";
import { requireAuth } from "../user";
import { PagesBuildHandler, PagesBuildOptions } from "./build";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import * as CreateDeployment from "./createDeployment";
import * as PagesDev from "./dev";
import * as Projects from "./projects";
import { listProjects } from "./projects";
import { CLEANUP, pagesBetaWarning } from "./utils";
import type { Deployment, PagesConfigCache } from "./types";
import type { BuilderCallback } from "yargs";

process.on("SIGINT", () => {
  CLEANUP();
  process.exit();
});
process.on("SIGTERM", () => {
  CLEANUP();
  process.exit();
});

export const pages: BuilderCallback<unknown, unknown> = (yargs) => {
  return yargs
    .command(
      "dev [directory] [-- command..]",
      "🧑‍💻 Develop your full-stack Pages application locally",
      PagesDev.options,
      PagesDev.handler
    )
    .command("functions", false, (yargs) =>
      // we hide this command from help output because
      // it's not meant to be used directly right now
      {
        return yargs.command(
          "build [directory]",
          "Compile a folder of Cloudflare Pages Functions into a single Worker",
          PagesBuildOptions,
          PagesBuildHandler
        );
      }
    )
    .command("project", "⚡️ Interact with your Pages projects", (yargs) =>
      yargs
        .command(
          "list",
          "List your Cloudflare Pages projects",
          Projects.ListOptions,
          Projects.ListHandler
        )
        .command(
          "create [project-name]",
          "Create a new Cloudflare Pages project",
          Projects.CreateOptions,
          Projects.CreateHandler
        )
        .epilogue(pagesBetaWarning)
    )
    .command(
      "deployment",
      "🚀 Interact with the deployments of a project",
      (yargs) =>
        yargs
          .command(
            "list",
            "List deployments in your Cloudflare Pages project",
            (yargs) =>
              yargs
                .options({
                  "project-name": {
                    type: "string",
                    description:
                      "The name of the project you would like to list deployments for",
                  },
                })
                .epilogue(pagesBetaWarning),
            async ({ projectName }) => {
              const config = getConfigCache<PagesConfigCache>(
                PAGES_CONFIG_CACHE_FILENAME
              );
              const accountId = await requireAuth(config);

              projectName ??= config.project_name;

              const isInteractive = process.stdin.isTTY;
              if (!projectName && isInteractive) {
                const projects = await listProjects({ accountId });
                projectName = await new Promise((resolve) => {
                  const { unmount } = render(
                    <>
                      <Text>Select a project:</Text>
                      <SelectInput
                        items={projects.map((project) => ({
                          key: project.name,
                          label: project.name,
                          value: project,
                        }))}
                        onSelect={async (selected) => {
                          resolve(selected.value.name);
                          unmount();
                        }}
                      />
                    </>
                  );
                });
              }

              if (!projectName) {
                throw new FatalError("Must specify a project name.", 1);
              }

              const deployments: Array<Deployment> = await fetchResult(
                `/accounts/${accountId}/pages/projects/${projectName}/deployments`
              );

              const titleCase = (word: string) =>
                word.charAt(0).toUpperCase() + word.slice(1);

              const shortSha = (sha: string) => sha.slice(0, 7);

              const getStatus = (deployment: Deployment) => {
                // Return a pretty time since timestamp if successful otherwise the status
                if (deployment.latest_stage.status === `success`) {
                  return timeagoFormat(deployment.latest_stage.ended_on);
                }
                return titleCase(deployment.latest_stage.status);
              };

              const data = deployments.map((deployment) => {
                return {
                  Environment: titleCase(deployment.environment),
                  Branch: deployment.deployment_trigger.metadata.branch,
                  Source: shortSha(
                    deployment.deployment_trigger.metadata.commit_hash
                  ),
                  Deployment: deployment.url,
                  Status: getStatus(deployment),
                  // TODO: Use a url shortener
                  Build: `https://dash.cloudflare.com/${accountId}/pages/view/${deployment.project_name}/${deployment.id}`,
                };
              });

              saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
                account_id: accountId,
              });

              render(<Table data={data}></Table>);
            }
          )
          .command({
            command: "create [directory]",
            describe:
              "🆙 Publish a directory of static assets as a Pages deployment",
            builder: CreateDeployment.options,
            handler: CreateDeployment.handler,
          })
          .epilogue(pagesBetaWarning)
    )
    .command({
      command: "create [directory]",
      describe: "🆙 Publish a directory of static assets as a Pages deployment",
      builder: CreateDeployment.options,
      handler: CreateDeployment.handler,
    })
    .epilogue(pagesBetaWarning);
};
