import * as config from "./public";

// Re-export declarations do not expose @deprecated to TypeScript consumers.
// Aliases preserve editor guidance and share the canonical runtime values and types.
/** @deprecated Import RawConfig from `@cloudflare/workers-utils/config` instead. */
export type RawConfig = config.RawConfig;

/** @deprecated Import Config from `@cloudflare/workers-utils/config` instead. */
export type Config = config.Config;

/** @deprecated Import RawDevConfig from `@cloudflare/workers-utils/config` instead. */
export type RawDevConfig = config.RawDevConfig;

/** @deprecated Import ConfigFields from `@cloudflare/workers-utils/config` instead. */
export type ConfigFields<Dev extends config.RawDevConfig> =
	config.ConfigFields<Dev>;

/** @deprecated Import RawEnvironment from `@cloudflare/workers-utils/config` instead. */
export type RawEnvironment = config.RawEnvironment;

/** @deprecated Import ConfigBindingOptions from `@cloudflare/workers-utils/config` instead. */
export type ConfigBindingOptions = config.ConfigBindingOptions;

/** @deprecated Import Environment from `@cloudflare/workers-utils/config` instead. */
export type Environment = config.Environment;

/** @deprecated Import LocalS3Credentials from `@cloudflare/workers-utils/config` instead. */
export type LocalS3Credentials = config.LocalS3Credentials;

/** @deprecated Import ZoneIdRoute from `@cloudflare/workers-utils/config` instead. */
export type ZoneIdRoute = config.ZoneIdRoute;

/** @deprecated Import ZoneNameRoute from `@cloudflare/workers-utils/config` instead. */
export type ZoneNameRoute = config.ZoneNameRoute;

/** @deprecated Import CustomDomainRoute from `@cloudflare/workers-utils/config` instead. */
export type CustomDomainRoute = config.CustomDomainRoute;

/** @deprecated Import Route from `@cloudflare/workers-utils/config` instead. */
export type Route = config.Route;

/** @deprecated Import CloudchamberConfig from `@cloudflare/workers-utils/config` instead. */
export type CloudchamberConfig = config.CloudchamberConfig;

/** @deprecated Import DurableObjectContainerImage from `@cloudflare/workers-utils/config` instead. */
export type DurableObjectContainerImage = config.DurableObjectContainerImage;

/** @deprecated Import ContainerObservability from `@cloudflare/workers-utils/config` instead. */
export type ContainerObservability = config.ContainerObservability;

/** @deprecated Import ContainerApp from `@cloudflare/workers-utils/config` instead. */
export type ContainerApp = config.ContainerApp;

/** @deprecated Import DurableObjectMigration from `@cloudflare/workers-utils/config` instead. */
export type DurableObjectMigration = config.DurableObjectMigration;

/** @deprecated Import DurableObjectExportStorage from `@cloudflare/workers-utils/config` instead. */
export type DurableObjectExportStorage = config.DurableObjectExportStorage;

/** @deprecated Import DurableObjectExport from `@cloudflare/workers-utils/config` instead. */
export type DurableObjectExport = config.DurableObjectExport;

/** @deprecated Import WorkerEntrypointExport from `@cloudflare/workers-utils/config` instead. */
export type WorkerEntrypointExport = config.WorkerEntrypointExport;

/** @deprecated Import WorkflowExport from `@cloudflare/workers-utils/config` instead. */
export type WorkflowExport = config.WorkflowExport;

/** @deprecated Import ConfiguredExport from `@cloudflare/workers-utils/config` instead. */
export type ConfiguredExport = config.ConfiguredExport;

/** @deprecated Import Exports from `@cloudflare/workers-utils/config` instead. */
export type Exports = config.Exports;

/** @deprecated Import DurableObjectBindings from `@cloudflare/workers-utils/config` instead. */
export type DurableObjectBindings = config.DurableObjectBindings;

/** @deprecated Import DurableObjectCodeUpdateStrategy from `@cloudflare/workers-utils/config` instead. */
export type DurableObjectCodeUpdateStrategy =
	config.DurableObjectCodeUpdateStrategy;

/** @deprecated Import DurableObjectsConfig from `@cloudflare/workers-utils/config` instead. */
export type DurableObjectsConfig = config.DurableObjectsConfig;

/** @deprecated Import RawDurableObjectsConfig from `@cloudflare/workers-utils/config` instead. */
export type RawDurableObjectsConfig = config.RawDurableObjectsConfig;

/** @deprecated Import ARTIFACTS_EVENT_TYPES from `@cloudflare/workers-utils/config` instead. */
export const ARTIFACTS_EVENT_TYPES = config.ARTIFACTS_EVENT_TYPES;

/** @deprecated Import ArtifactsEventType from `@cloudflare/workers-utils/config` instead. */
export type ArtifactsEventType = config.ArtifactsEventType;

/** @deprecated Import ArtifactsEventTrigger from `@cloudflare/workers-utils/config` instead. */
export type ArtifactsEventTrigger = config.ArtifactsEventTrigger;

/** @deprecated Import WORKFLOW_JURISDICTIONS from `@cloudflare/workers-utils/config` instead. */
export const WORKFLOW_JURISDICTIONS = config.WORKFLOW_JURISDICTIONS;

/** @deprecated Import WorkflowJurisdiction from `@cloudflare/workers-utils/config` instead. */
export type WorkflowJurisdiction = config.WorkflowJurisdiction;

/** @deprecated Import WorkflowBinding from `@cloudflare/workers-utils/config` instead. */
export type WorkflowBinding = config.WorkflowBinding;

/** @deprecated Import EnvironmentNonInheritable from `@cloudflare/workers-utils/config` instead. */
export type EnvironmentNonInheritable = config.EnvironmentNonInheritable;

/** @deprecated Import Rule from `@cloudflare/workers-utils/config` instead. */
export type Rule = config.Rule;

/** @deprecated Import ConfigModuleRuleType from `@cloudflare/workers-utils/config` instead. */
export type ConfigModuleRuleType = config.ConfigModuleRuleType;

/** @deprecated Import DEFAULT_MODULE_RULES from `@cloudflare/workers-utils/config` instead. */
export const DEFAULT_MODULE_RULES = config.DEFAULT_MODULE_RULES;

/** @deprecated Import TailConsumer from `@cloudflare/workers-utils/config` instead. */
export type TailConsumer = config.TailConsumer;

/** @deprecated Import StreamingTailConsumer from `@cloudflare/workers-utils/config` instead. */
export type StreamingTailConsumer = config.StreamingTailConsumer;

/** @deprecated Import DispatchNamespaceOutbound from `@cloudflare/workers-utils/config` instead. */
export type DispatchNamespaceOutbound = config.DispatchNamespaceOutbound;

/** @deprecated Import UserLimits from `@cloudflare/workers-utils/config` instead. */
export type UserLimits = config.UserLimits;

/** @deprecated Import Assets from `@cloudflare/workers-utils/config` instead. */
export type Assets = config.Assets;

/** @deprecated Import Observability from `@cloudflare/workers-utils/config` instead. */
export type Observability = config.Observability;

/** @deprecated Import Access from `@cloudflare/workers-utils/config` instead. */
export type Access = config.Access;

/** @deprecated Import CacheOptions from `@cloudflare/workers-utils/config` instead. */
export type CacheOptions = config.CacheOptions;

/** @deprecated Import DockerConfiguration from `@cloudflare/workers-utils/config` instead. */
export type DockerConfiguration = config.DockerConfiguration;

/** @deprecated Import ContainerEngine from `@cloudflare/workers-utils/config` instead. */
export type ContainerEngine = config.ContainerEngine;

/** @deprecated Import PreviewsConfig from `@cloudflare/workers-utils/config` instead. */
export type PreviewsConfig = config.PreviewsConfig;

/** @deprecated Import partitionExports from `@cloudflare/workers-utils/config` instead. */
export const partitionExports = config.partitionExports;

/** @deprecated Import ExportType from `@cloudflare/workers-utils/config` instead. */
export type ExportType = config.ExportType;

/** @deprecated Import PartitionedExports from `@cloudflare/workers-utils/config` instead. */
export type PartitionedExports = config.PartitionedExports;

/** @deprecated Import getDurableObjectExports from `@cloudflare/workers-utils/config` instead. */
export const getDurableObjectExports = config.getDurableObjectExports;

/** @deprecated Import hasDurableObjectExports from `@cloudflare/workers-utils/config` instead. */
export const hasDurableObjectExports = config.hasDurableObjectExports;

/** @deprecated Import isLiveDurableObjectExport from `@cloudflare/workers-utils/config` instead. */
export const isLiveDurableObjectExport = config.isLiveDurableObjectExport;

/** @deprecated Import LiveDurableObjectExport from `@cloudflare/workers-utils/config` instead. */
export type LiveDurableObjectExport = config.LiveDurableObjectExport;

/** @deprecated Import getContainerDurableObjectClassNames from `@cloudflare/workers-utils/config` instead. */
export const getContainerDurableObjectClassNames =
	config.getContainerDurableObjectClassNames;

/** @deprecated Import getContainerNameToClassNameMap from `@cloudflare/workers-utils/config` instead. */
export const getContainerNameToClassNameMap =
	config.getContainerNameToClassNameMap;

/** @deprecated Import getDefaultDurableObjectContainerAppName from `@cloudflare/workers-utils/config` instead. */
export const getDefaultDurableObjectContainerAppName =
	config.getDefaultDurableObjectContainerAppName;

/** @deprecated Import getDurableObjectClassNameToUseSQLiteMap from `@cloudflare/workers-utils/config` instead. */
export const getDurableObjectClassNameToUseSQLiteMap =
	config.getDurableObjectClassNameToUseSQLiteMap;

/** @deprecated Import getDurableObjectContainerApps from `@cloudflare/workers-utils/config` instead. */
export const getDurableObjectContainerApps =
	config.getDurableObjectContainerApps;

/** @deprecated Import getResolvedDurableObjectContainerApps from `@cloudflare/workers-utils/config` instead. */
export const getResolvedDurableObjectContainerApps =
	config.getResolvedDurableObjectContainerApps;

/** @deprecated Import isDurableObjectContainerApp from `@cloudflare/workers-utils/config` instead. */
export const isDurableObjectContainerApp = config.isDurableObjectContainerApp;

/** @deprecated Import resolveContainerClassName from `@cloudflare/workers-utils/config` instead. */
export const resolveContainerClassName = config.resolveContainerClassName;

/** @deprecated Import validateDurableObjectContainerApplications from `@cloudflare/workers-utils/config` instead. */
export const validateDurableObjectContainerApplications =
	config.validateDurableObjectContainerApplications;

/** @deprecated Import DurableObjectContainerApp from `@cloudflare/workers-utils/config` instead. */
export type DurableObjectContainerApp = config.DurableObjectContainerApp;

/** @deprecated Import ResolvedDurableObjectContainerApp from `@cloudflare/workers-utils/config` instead. */
export type ResolvedDurableObjectContainerApp =
	config.ResolvedDurableObjectContainerApp;

/** @deprecated Import RedirectedRawConfig from `@cloudflare/workers-utils/config` instead. */
export type RedirectedRawConfig = config.RedirectedRawConfig;

/** @deprecated Import defaultWranglerConfig from `@cloudflare/workers-utils/config` instead. */
export const defaultWranglerConfig = config.defaultWranglerConfig;

/** @deprecated Import formatConfigSnippet from `@cloudflare/workers-utils/config` instead. */
export const formatConfigSnippet = config.formatConfigSnippet;

/** @deprecated Import configFormat from `@cloudflare/workers-utils/config` instead. */
export const configFormat = config.configFormat;

/** @deprecated Import configFileName from `@cloudflare/workers-utils/config` instead. */
export const configFileName = config.configFileName;

/** @deprecated Import experimental_readRawConfig from `@cloudflare/workers-utils/config` instead. */
export const experimental_readRawConfig = config.experimental_readRawConfig;

/** @deprecated Import experimental_patchConfig from `@cloudflare/workers-utils/config` instead. */
export const experimental_patchConfig = config.experimental_patchConfig;

/** @deprecated Import PatchConfigError from `@cloudflare/workers-utils/config` instead. */
export const PatchConfigError = config.PatchConfigError;

/** @deprecated Import PatchConfigError from `@cloudflare/workers-utils/config` instead. */
export type PatchConfigError = config.PatchConfigError;

/** @deprecated Import getBindingTypeFriendlyName from `@cloudflare/workers-utils/config` instead. */
export const getBindingTypeFriendlyName = config.getBindingTypeFriendlyName;

/** @deprecated Import isPagesConfig from `@cloudflare/workers-utils/config` instead. */
export const isPagesConfig = config.isPagesConfig;

/** @deprecated Import normalizeAndValidateConfig from `@cloudflare/workers-utils/config` instead. */
export const normalizeAndValidateConfig = config.normalizeAndValidateConfig;

/** @deprecated Import NormalizeAndValidateConfigArgs from `@cloudflare/workers-utils/config` instead. */
export type NormalizeAndValidateConfigArgs =
	config.NormalizeAndValidateConfigArgs;

/** @deprecated Import ConfigBindingFieldName from `@cloudflare/workers-utils/config` instead. */
export type ConfigBindingFieldName = config.ConfigBindingFieldName;

/** @deprecated Import isValidR2BucketName from `@cloudflare/workers-utils/config` instead. */
export const isValidR2BucketName = config.isValidR2BucketName;

/** @deprecated Import bucketFormatMessage from `@cloudflare/workers-utils/config` instead. */
export const bucketFormatMessage = config.bucketFormatMessage;

/** @deprecated Import BindingLocalSupport from `@cloudflare/workers-utils/config` instead. */
export type BindingLocalSupport = config.BindingLocalSupport;

/** @deprecated Import getBindingLocalSupport from `@cloudflare/workers-utils/config` instead. */
export const getBindingLocalSupport = config.getBindingLocalSupport;

/** @deprecated Import resolveBindingRemote from `@cloudflare/workers-utils/config` instead. */
export const resolveBindingRemote = config.resolveBindingRemote;

/** @deprecated Import validateBindingRemoteSetting from `@cloudflare/workers-utils/config` instead. */
export const validateBindingRemoteSetting = config.validateBindingRemoteSetting;

/** @deprecated Import ArtifactsDevBinding from `@cloudflare/workers-utils/config` instead. */
export type ArtifactsDevBinding = config.ArtifactsDevBinding;

/** @deprecated Import ArtifactsLocalDefaultWarner from `@cloudflare/workers-utils/config` instead. */
export type ArtifactsLocalDefaultWarner = config.ArtifactsLocalDefaultWarner;

/** @deprecated Import createArtifactsLocalDefaultWarner from `@cloudflare/workers-utils/config` instead. */
export const createArtifactsLocalDefaultWarner =
	config.createArtifactsLocalDefaultWarner;

/** @deprecated Import validatePagesConfig from `@cloudflare/workers-utils/config` instead. */
export const validatePagesConfig = config.validatePagesConfig;

/** @deprecated Import Diagnostics from `@cloudflare/workers-utils/config` instead. */
export const Diagnostics = config.Diagnostics;

/** @deprecated Import Diagnostics from `@cloudflare/workers-utils/config` instead. */
export type Diagnostics = config.Diagnostics;

/** @deprecated Import hasProperty from `@cloudflare/workers-utils/config` instead. */
export const hasProperty = config.hasProperty;

/** @deprecated Import isRequiredProperty from `@cloudflare/workers-utils/config` instead. */
export const isRequiredProperty = config.isRequiredProperty;

/** @deprecated Import isOptionalProperty from `@cloudflare/workers-utils/config` instead. */
export const isOptionalProperty = config.isOptionalProperty;

/** @deprecated Import resolveWranglerConfigPath from `@cloudflare/workers-utils/config` instead. */
export const resolveWranglerConfigPath = config.resolveWranglerConfigPath;

/** @deprecated Import findWranglerConfig from `@cloudflare/workers-utils/config` instead. */
export const findWranglerConfig = config.findWranglerConfig;

/** @deprecated Import isRedirectedConfig from `@cloudflare/workers-utils/config` instead. */
export const isRedirectedConfig = config.isRedirectedConfig;

/** @deprecated Import ResolveConfigPathOptions from `@cloudflare/workers-utils/config` instead. */
export type ResolveConfigPathOptions = config.ResolveConfigPathOptions;

/** @deprecated Import constructWranglerConfig from `@cloudflare/workers-utils/config` instead. */
export const constructWranglerConfig = config.constructWranglerConfig;

/** @deprecated Import convertConfigToBindings from `@cloudflare/workers-utils/config` instead. */
export const convertConfigToBindings = config.convertConfigToBindings;

/** @deprecated Import extractBindingsOfType from `@cloudflare/workers-utils/config` instead. */
export const extractBindingsOfType = config.extractBindingsOfType;

/** @deprecated Import getBindings from `@cloudflare/workers-utils/config` instead. */
export const getBindings = config.getBindings;

/** @deprecated Import isUnsafeBindingType from `@cloudflare/workers-utils/config` instead. */
export const isUnsafeBindingType = config.isUnsafeBindingType;

/** @deprecated Import ConvertBindingsOptions from `@cloudflare/workers-utils/config` instead. */
export type ConvertBindingsOptions = config.ConvertBindingsOptions;

/** @deprecated Import isDockerfile from `@cloudflare/workers-utils/config` instead. */
export const isDockerfile = config.isDockerfile;

/** @deprecated Use getBindingTypeFriendlyName from `@cloudflare/workers-utils/config` instead. */
export const friendlyBindingNames = config.friendlyBindingNames;
