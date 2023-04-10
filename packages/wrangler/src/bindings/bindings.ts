import { Environment } from "../config/environment";
import { RawConfig, RawEnvironment } from "../config";
import { Diagnostics } from "../config/diagnostics";
import type {DurableObjectFromConfig, BindingTypeDurableObject, CfDurableObject } from "./binding-durable-object"
import {get_durable_object } from "./binding-durable-object"
export type { DurableObjectFromConfig, BindingTypeDurableObject, CfDurableObject }

export type BindingTypesNonInheritable = BindingTypeDurableObject;

export function get_env_bindings_array(
	diagnostics: Diagnostics,
	topLevelEnv: Environment | undefined,
	rawConfig: RawConfig | undefined,
	rawEnv: RawEnvironment,
	envName: string,
){
  return {
    durable_objects: get_durable_object(diagnostics, topLevelEnv, rawConfig, rawEnv, envName),
  }
}
