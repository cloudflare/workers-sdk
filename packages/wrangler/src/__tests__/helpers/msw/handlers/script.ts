import { http, HttpResponse } from "msw";
import { createFetchResult } from "../index";
import type { WorkerMetadata } from "@cloudflare/workers-utils";

const bindings: Record<string, WorkerMetadata["bindings"]> = {
	"durable-object": [
		{
			type: "durable_object_namespace",
			name: "TestDO",
			class_name: "TestDO",
		},
	],
};
const scripts: Record<string, string> = {
	websocket: `new WebSocket("ws://dummy")`,
	response: `return new Response("ok")`,
};
function getBindings(scriptName: string | readonly string[] | undefined) {
	if (typeof scriptName !== "string") {
		return "";
	}
	return scriptName.split("--").flatMap((part) => bindings[part] ?? []);
}
function getScript(scriptName: string | readonly string[] | undefined): string {
	if (typeof scriptName !== "string") {
		return "";
	}
	return `export default {fetch(request){
    ${scriptName
			.split("--")
			.map((part) => scripts[part] ?? "")
			.join(";\n")}
  }}`;
}
export default [
	http.get(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:env/content",
		({ params }) => {
			return HttpResponse.text(getScript(params.scriptName));
		}
	),
	http.get(
		"*/accounts/:accountId/workers/scripts/:scriptName",
		({ params }) => {
			return HttpResponse.text(getScript(params.scriptName));
		}
	),
	http.get(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:env/bindings",
		({ params }) => {
			return HttpResponse.json(
				createFetchResult(getBindings(params.scriptName))
			);
		}
	),
	http.get(
		"*/accounts/:accountId/workers/scripts/:scriptName/bindings",
		({ params }) => {
			return HttpResponse.json(
				createFetchResult(getBindings(params.scriptName))
			);
		}
	),
];
