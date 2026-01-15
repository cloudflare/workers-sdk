/**
 * Auto-generated from compatibility-date.capnp - DO NOT EDIT MANUALLY
 *
 * This file is regenerated when the workerd dependency is updated.
 * Source: https://raw.githubusercontent.com/cloudflare/workerd/main/src/workerd/io/compatibility-date.capnp
 *
 * @see {@link file://./../../../scripts/build-capnp-compat.mjs} for documentation
 */

export interface FlagMetadata {
	fieldName: string;
	ordinal: number;
	enableFlag?: string;
	disableFlag?: string;
	enableDate?: string;
	experimental?: boolean;
	impliedBy?: Array<{ names: string[]; date: string }>;
}

export const FLAG_METADATA: FlagMetadata[] = [
	{
		"fieldName": "formDataParserSupportsFiles",
		"ordinal": 0,
		"enableFlag": "formdata_parser_supports_files",
		"enableDate": "2021-11-03",
		"disableFlag": "formdata_parser_converts_files_to_strings"
	},
	{
		"fieldName": "fetchRefusesUnknownProtocols",
		"ordinal": 1,
		"enableFlag": "fetch_refuses_unknown_protocols",
		"enableDate": "2021-11-10",
		"disableFlag": "fetch_treats_unknown_protocols_as_http"
	},
	{
		"fieldName": "esiIncludeIsVoidTag",
		"ordinal": 2,
		"enableFlag": "html_rewriter_treats_esi_include_as_void_tag"
	},
	{
		"fieldName": "obsolete3",
		"ordinal": 3
	},
	{
		"fieldName": "durableObjectFetchRequiresSchemeAuthority",
		"ordinal": 4,
		"enableFlag": "durable_object_fetch_requires_full_url",
		"enableDate": "2021-11-10",
		"disableFlag": "durable_object_fetch_allows_relative_url"
	},
	{
		"fieldName": "streamsByobReaderDetachesBuffer",
		"ordinal": 5,
		"enableFlag": "streams_byob_reader_detaches_buffer",
		"enableDate": "2021-11-10",
		"disableFlag": "streams_byob_reader_does_not_detach_buffer"
	},
	{
		"fieldName": "streamsJavaScriptControllers",
		"ordinal": 6,
		"enableFlag": "streams_enable_constructors",
		"enableDate": "2022-11-30",
		"disableFlag": "streams_disable_constructors"
	},
	{
		"fieldName": "jsgPropertyOnPrototypeTemplate",
		"ordinal": 7,
		"enableFlag": "workers_api_getters_setters_on_prototype",
		"enableDate": "2022-01-31",
		"disableFlag": "workers_api_getters_setters_on_instance"
	},
	{
		"fieldName": "minimalSubrequests",
		"ordinal": 8,
		"enableFlag": "minimal_subrequests",
		"enableDate": "2022-04-05",
		"disableFlag": "no_minimal_subrequests"
	},
	{
		"fieldName": "noCotsOnExternalFetch",
		"ordinal": 9,
		"enableFlag": "no_cots_on_external_fetch",
		"enableDate": "2022-03-08",
		"disableFlag": "cots_on_external_fetch"
	},
	{
		"fieldName": "specCompliantUrl",
		"ordinal": 10,
		"enableFlag": "url_standard",
		"enableDate": "2022-10-31",
		"disableFlag": "url_original"
	},
	{
		"fieldName": "globalNavigator",
		"ordinal": 11,
		"enableFlag": "global_navigator",
		"enableDate": "2022-03-21",
		"disableFlag": "no_global_navigator"
	},
	{
		"fieldName": "captureThrowsAsRejections",
		"ordinal": 12,
		"enableFlag": "capture_async_api_throws",
		"enableDate": "2022-10-31",
		"disableFlag": "do_not_capture_async_api_throws"
	},
	{
		"fieldName": "r2PublicBetaApi",
		"ordinal": 13,
		"enableFlag": "r2_public_beta_bindings",
		"disableFlag": "r2_internal_beta_bindings"
	},
	{
		"fieldName": "obsolete14",
		"ordinal": 14,
		"enableFlag": "durable_object_alarms"
	},
	{
		"fieldName": "noSubstituteNull",
		"ordinal": 15,
		"enableFlag": "dont_substitute_null_on_type_error",
		"enableDate": "2022-06-01",
		"disableFlag": "substitute_null_on_type_error"
	},
	{
		"fieldName": "transformStreamJavaScriptControllers",
		"ordinal": 16,
		"enableFlag": "transformstream_enable_standard_constructor",
		"enableDate": "2022-11-30",
		"disableFlag": "transformstream_disable_standard_constructor"
	},
	{
		"fieldName": "r2ListHonorIncludeFields",
		"ordinal": 17,
		"enableFlag": "r2_list_honor_include",
		"enableDate": "2022-08-04"
	},
	{
		"fieldName": "exportCommonJsDefaultNamespace",
		"ordinal": 18,
		"enableFlag": "export_commonjs_default",
		"enableDate": "2022-10-31",
		"disableFlag": "export_commonjs_namespace"
	},
	{
		"fieldName": "obsolete19",
		"ordinal": 19,
		"enableFlag": "durable_object_rename",
		"experimental": true
	},
	{
		"fieldName": "webSocketCompression",
		"ordinal": 20,
		"enableFlag": "web_socket_compression",
		"enableDate": "2023-08-15",
		"disableFlag": "no_web_socket_compression"
	},
	{
		"fieldName": "nodeJsCompat",
		"ordinal": 21,
		"enableFlag": "nodejs_compat",
		"disableFlag": "no_nodejs_compat"
	},
	{
		"fieldName": "obsolete22",
		"ordinal": 22,
		"enableFlag": "tcp_sockets_support"
	},
	{
		"fieldName": "specCompliantResponseRedirect",
		"ordinal": 23,
		"enableDate": "2023-03-14",
		"enableFlag": "response_redirect_url_standard",
		"disableFlag": "response_redirect_url_original"
	},
	{
		"fieldName": "workerdExperimental",
		"ordinal": 24,
		"enableFlag": "experimental",
		"experimental": true
	},
	{
		"fieldName": "durableObjectGetExisting",
		"ordinal": 25,
		"enableFlag": "durable_object_get_existing",
		"experimental": true
	},
	{
		"fieldName": "httpHeadersGetSetCookie",
		"ordinal": 26,
		"enableFlag": "http_headers_getsetcookie",
		"disableFlag": "no_http_headers_getsetcookie",
		"enableDate": "2023-03-01"
	},
	{
		"fieldName": "dispatchExceptionTunneling",
		"ordinal": 27,
		"enableDate": "2023-03-01",
		"enableFlag": "dynamic_dispatch_tunnel_exceptions",
		"disableFlag": "dynamic_dispatch_treat_exceptions_as_500"
	},
	{
		"fieldName": "serviceBindingExtraHandlers",
		"ordinal": 28,
		"enableFlag": "service_binding_extra_handlers",
		"experimental": true
	},
	{
		"fieldName": "noCfBotManagementDefault",
		"ordinal": 29,
		"enableFlag": "no_cf_botmanagement_default",
		"disableFlag": "cf_botmanagement_default",
		"enableDate": "2023-08-01"
	},
	{
		"fieldName": "urlSearchParamsDeleteHasValueArg",
		"ordinal": 30,
		"enableFlag": "urlsearchparams_delete_has_value_arg",
		"disableFlag": "no_urlsearchparams_delete_has_value_arg",
		"enableDate": "2023-07-01"
	},
	{
		"fieldName": "strictCompression",
		"ordinal": 31,
		"enableFlag": "strict_compression_checks",
		"disableFlag": "no_strict_compression_checks",
		"enableDate": "2023-08-01"
	},
	{
		"fieldName": "brotliContentEncoding",
		"ordinal": 32,
		"enableFlag": "brotli_content_encoding",
		"enableDate": "2024-04-29",
		"disableFlag": "no_brotli_content_encoding"
	},
	{
		"fieldName": "strictCrypto",
		"ordinal": 33,
		"enableFlag": "strict_crypto_checks",
		"disableFlag": "no_strict_crypto_checks",
		"enableDate": "2023-08-01"
	},
	{
		"fieldName": "rttiApi",
		"ordinal": 34,
		"enableFlag": "rtti_api",
		"experimental": true
	},
	{
		"fieldName": "obsolete35",
		"ordinal": 35,
		"enableFlag": "webgpu",
		"experimental": true
	},
	{
		"fieldName": "cryptoPreservePublicExponent",
		"ordinal": 36,
		"enableFlag": "crypto_preserve_public_exponent",
		"disableFlag": "no_crypto_preserve_public_exponent",
		"enableDate": "2023-12-01"
	},
	{
		"fieldName": "vectorizeQueryMetadataOptional",
		"ordinal": 37,
		"enableFlag": "vectorize_query_metadata_optional",
		"enableDate": "2023-11-08",
		"disableFlag": "vectorize_query_original"
	},
	{
		"fieldName": "unsafeModule",
		"ordinal": 38,
		"enableFlag": "unsafe_module",
		"experimental": true
	},
	{
		"fieldName": "jsRpc",
		"ordinal": 39,
		"enableFlag": "js_rpc",
		"experimental": true
	},
	{
		"fieldName": "noImportScripts",
		"ordinal": 40,
		"enableFlag": "no_global_importscripts",
		"disableFlag": "global_importscripts",
		"enableDate": "2024-03-04"
	},
	{
		"fieldName": "nodeJsAls",
		"ordinal": 41,
		"enableFlag": "nodejs_als",
		"disableFlag": "no_nodejs_als"
	},
	{
		"fieldName": "queuesJsonMessages",
		"ordinal": 42,
		"enableFlag": "queues_json_messages",
		"disableFlag": "no_queues_json_messages",
		"enableDate": "2024-03-18"
	},
	{
		"fieldName": "pythonWorkers",
		"ordinal": 43,
		"enableFlag": "python_workers",
		"impliedBy": [
			{
				"names": [
					"pythonWorkersDevPyodide"
				],
				"date": "2000-01-01"
			}
		]
	},
	{
		"fieldName": "fetcherNoGetPutDelete",
		"ordinal": 44,
		"enableFlag": "fetcher_no_get_put_delete",
		"disableFlag": "fetcher_has_get_put_delete",
		"enableDate": "2024-03-26"
	},
	{
		"fieldName": "unwrapCustomThenables",
		"ordinal": 45,
		"enableFlag": "unwrap_custom_thenables",
		"disableFlag": "no_unwrap_custom_thenables",
		"enableDate": "2024-04-01"
	},
	{
		"fieldName": "fetcherRpc",
		"ordinal": 46,
		"enableFlag": "rpc",
		"disableFlag": "no_rpc",
		"enableDate": "2024-04-03"
	},
	{
		"fieldName": "internalStreamByobReturn",
		"ordinal": 47,
		"enableFlag": "internal_stream_byob_return_view",
		"disableFlag": "internal_stream_byob_return_undefined",
		"enableDate": "2024-05-13"
	},
	{
		"fieldName": "blobStandardMimeType",
		"ordinal": 48,
		"enableFlag": "blob_standard_mime_type",
		"disableFlag": "blob_legacy_mime_type",
		"enableDate": "2024-06-03"
	},
	{
		"fieldName": "fetchStandardUrl",
		"ordinal": 49,
		"enableFlag": "fetch_standard_url",
		"disableFlag": "fetch_legacy_url",
		"enableDate": "2024-06-03"
	},
	{
		"fieldName": "nodeJsCompatV2",
		"ordinal": 50,
		"enableFlag": "nodejs_compat_v2",
		"disableFlag": "no_nodejs_compat_v2",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2024-09-23"
			}
		]
	},
	{
		"fieldName": "globalFetchStrictlyPublic",
		"ordinal": 51,
		"enableFlag": "global_fetch_strictly_public",
		"disableFlag": "global_fetch_private_origin"
	},
	{
		"fieldName": "newModuleRegistry",
		"ordinal": 52,
		"enableFlag": "new_module_registry",
		"disableFlag": "legacy_module_registry",
		"experimental": true
	},
	{
		"fieldName": "cacheOptionEnabled",
		"ordinal": 53,
		"enableFlag": "cache_option_enabled",
		"disableFlag": "cache_option_disabled",
		"enableDate": "2024-11-11"
	},
	{
		"fieldName": "kvDirectBinding",
		"ordinal": 54,
		"enableFlag": "kv_direct_binding",
		"experimental": true
	},
	{
		"fieldName": "allowCustomPorts",
		"ordinal": 55,
		"enableFlag": "allow_custom_ports",
		"disableFlag": "ignore_custom_ports",
		"enableDate": "2024-09-02"
	},
	{
		"fieldName": "increaseWebsocketMessageSize",
		"ordinal": 56,
		"enableFlag": "increase_websocket_message_size",
		"experimental": true
	},
	{
		"fieldName": "internalWritableStreamAbortClearsQueue",
		"ordinal": 57,
		"enableFlag": "internal_writable_stream_abort_clears_queue",
		"disableFlag": "internal_writable_stream_abort_does_not_clear_queue",
		"enableDate": "2024-09-02"
	},
	{
		"fieldName": "pythonWorkersDevPyodide",
		"ordinal": 58,
		"enableFlag": "python_workers_development",
		"experimental": true
	},
	{
		"fieldName": "nodeJsZlib",
		"ordinal": 59,
		"enableFlag": "nodejs_zlib",
		"disableFlag": "no_nodejs_zlib",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat",
					"nodeJsCompatV2"
				],
				"date": "2024-09-23"
			}
		]
	},
	{
		"fieldName": "replicaRouting",
		"ordinal": 60,
		"enableFlag": "replica_routing",
		"experimental": true
	},
	{
		"fieldName": "obsolete61",
		"ordinal": 61,
		"enableFlag": "enable_d1_with_sessions_api",
		"experimental": true
	},
	{
		"fieldName": "handleCrossRequestPromiseResolution",
		"ordinal": 62,
		"enableFlag": "handle_cross_request_promise_resolution",
		"disableFlag": "no_handle_cross_request_promise_resolution",
		"enableDate": "2024-10-14"
	},
	{
		"fieldName": "obsolete63",
		"ordinal": 63,
		"experimental": true
	},
	{
		"fieldName": "setToStringTag",
		"ordinal": 64,
		"enableFlag": "set_tostring_tag",
		"disableFlag": "do_not_set_tostring_tag",
		"enableDate": "2024-09-26"
	},
	{
		"fieldName": "upperCaseAllHttpMethods",
		"ordinal": 65,
		"enableFlag": "upper_case_all_http_methods",
		"disableFlag": "no_upper_case_all_http_methods",
		"enableDate": "2024-10-14"
	},
	{
		"fieldName": "obsolete66",
		"ordinal": 66,
		"enableFlag": "python_external_packages"
	},
	{
		"fieldName": "noTopLevelAwaitInRequire",
		"ordinal": 67,
		"enableFlag": "disable_top_level_await_in_require",
		"disableFlag": "enable_top_level_await_in_require",
		"enableDate": "2024-12-02"
	},
	{
		"fieldName": "fixupTransformStreamBackpressure",
		"ordinal": 68,
		"enableFlag": "fixup-transform-stream-backpressure",
		"disableFlag": "original-transform-stream-backpressure",
		"enableDate": "2024-12-16"
	},
	{
		"fieldName": "obsolete69",
		"ordinal": 69,
		"enableFlag": "tail_worker_user_spans",
		"experimental": true
	},
	{
		"fieldName": "cacheNoCache",
		"ordinal": 70,
		"enableFlag": "cache_no_cache_enabled",
		"disableFlag": "cache_no_cache_disabled",
		"impliedBy": [
			{
				"names": [
					"cacheOptionEnabled"
				],
				"date": "2025-08-07"
			}
		]
	},
	{
		"fieldName": "pythonWorkers20250116",
		"ordinal": 71,
		"enableFlag": "python_workers_20250116",
		"disableFlag": "no_python_workers_20250116",
		"impliedBy": [
			{
				"names": [
					"pythonWorkers"
				],
				"date": "2025-09-29"
			}
		]
	},
	{
		"fieldName": "requestCfOverridesCacheRules",
		"ordinal": 72,
		"enableFlag": "request_cf_overrides_cache_rules",
		"disableFlag": "no_request_cf_overrides_cache_rules",
		"enableDate": "2025-04-02"
	},
	{
		"fieldName": "memoryCacheDelete",
		"ordinal": 73,
		"enableFlag": "memory_cache_delete",
		"experimental": true
	},
	{
		"fieldName": "queueConsumerNoWaitForWaitUntil",
		"ordinal": 75,
		"enableFlag": "queue_consumer_no_wait_for_wait_until",
		"disableFlag": "queue_consumer_wait_for_wait_until"
	},
	{
		"fieldName": "populateProcessEnv",
		"ordinal": 76,
		"enableFlag": "nodejs_compat_populate_process_env",
		"disableFlag": "nodejs_compat_do_not_populate_process_env",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-04-01"
			}
		]
	},
	{
		"fieldName": "cacheApiRequestCfOverridesCacheRules",
		"ordinal": 77,
		"enableFlag": "cache_api_request_cf_overrides_cache_rules",
		"disableFlag": "no_cache_api_request_cf_overrides_cache_rules",
		"enableDate": "2025-05-19"
	},
	{
		"fieldName": "disableImportableEnv",
		"ordinal": 78,
		"enableFlag": "disallow_importable_env",
		"disableFlag": "allow_importable_env"
	},
	{
		"fieldName": "assetsSecFetchModeNavigateHeaderPrefersAssetServing",
		"ordinal": 79,
		"enableFlag": "assets_navigation_prefers_asset_serving",
		"disableFlag": "assets_navigation_has_no_effect",
		"enableDate": "2025-04-01"
	},
	{
		"fieldName": "cacheApiCompatFlags",
		"ordinal": 80,
		"enableFlag": "cache_api_compat_flags",
		"disableFlag": "no_cache_api_compat_flags",
		"enableDate": "2025-04-19"
	},
	{
		"fieldName": "obsolete81",
		"ordinal": 81,
		"enableFlag": "python_workers_durable_objects",
		"experimental": true
	},
	{
		"fieldName": "obsolete82",
		"ordinal": 82,
		"enableFlag": "streaming_tail_worker",
		"experimental": true
	},
	{
		"fieldName": "specCompliantUrlpattern",
		"ordinal": 83,
		"enableFlag": "urlpattern_standard",
		"enableDate": "2025-05-01",
		"disableFlag": "urlpattern_original"
	},
	{
		"fieldName": "jsWeakRef",
		"ordinal": 84,
		"enableFlag": "enable_weak_ref",
		"enableDate": "2025-05-05",
		"disableFlag": "disable_weak_ref"
	},
	{
		"fieldName": "requestSignalPassthrough",
		"ordinal": 85,
		"enableFlag": "request_signal_passthrough",
		"disableFlag": "no_request_signal_passthrough"
	},
	{
		"fieldName": "enableNavigatorLanguage",
		"ordinal": 86,
		"enableFlag": "enable_navigator_language",
		"enableDate": "2025-05-19",
		"disableFlag": "disable_navigator_language"
	},
	{
		"fieldName": "webFileSystem",
		"ordinal": 87,
		"enableFlag": "enable_web_file_system",
		"experimental": true
	},
	{
		"fieldName": "abortSignalRpc",
		"ordinal": 88,
		"enableFlag": "enable_abortsignal_rpc",
		"experimental": true
	},
	{
		"fieldName": "allowEvalDuringStartup",
		"ordinal": 89,
		"enableFlag": "allow_eval_during_startup",
		"enableDate": "2025-06-01",
		"disableFlag": "disallow_eval_during_startup"
	},
	{
		"fieldName": "enableRequestSignal",
		"ordinal": 90,
		"enableFlag": "enable_request_signal",
		"disableFlag": "disable_request_signal"
	},
	{
		"fieldName": "connectPassThrough",
		"ordinal": 91,
		"enableFlag": "connect_pass_through",
		"experimental": true
	},
	{
		"fieldName": "bindAsyncLocalStorageSnapshot",
		"ordinal": 93,
		"enableFlag": "bind_asynclocalstorage_snapshot_to_request",
		"disableFlag": "do_not_bind_asynclocalstorage_snapshot_to-request",
		"enableDate": "2025-06-16"
	},
	{
		"fieldName": "throwOnUnrecognizedImportAssertion",
		"ordinal": 94,
		"enableFlag": "throw_on_unrecognized_import_assertion",
		"disableFlag": "ignore_unrecognized_import_assertion",
		"enableDate": "2025-06-16"
	},
	{
		"fieldName": "pythonWorkflows",
		"ordinal": 95,
		"enableFlag": "python_workflows",
		"disableFlag": "disable_python_workflows",
		"impliedBy": [
			{
				"names": [
					"pythonWorkers"
				],
				"date": "2025-09-20"
			}
		]
	},
	{
		"fieldName": "unsupportedProcessActualPlatform",
		"ordinal": 96,
		"enableFlag": "unsupported_process_actual_platform",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsProcessV2",
		"ordinal": 97,
		"enableFlag": "enable_nodejs_process_v2",
		"disableFlag": "disable_nodejs_process_v2",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-09-15"
			}
		]
	},
	{
		"fieldName": "setEventTargetThis",
		"ordinal": 98,
		"enableFlag": "set_event_target_this",
		"disableFlag": "no_set_event_target_this",
		"enableDate": "2025-08-01"
	},
	{
		"fieldName": "enableForwardableEmailFullHeaders",
		"ordinal": 99,
		"enableFlag": "set_forwardable_email_full_headers",
		"disableFlag": "set_forwardable_email_single_headers",
		"enableDate": "2025-08-01"
	},
	{
		"fieldName": "enableNodejsHttpModules",
		"ordinal": 100,
		"enableFlag": "enable_nodejs_http_modules",
		"disableFlag": "disable_nodejs_http_modules",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-08-15"
			}
		]
	},
	{
		"fieldName": "pedanticWpt",
		"ordinal": 101,
		"enableFlag": "pedantic_wpt",
		"disableFlag": "non_pedantic_wpt"
	},
	{
		"fieldName": "exposeGlobalMessageChannel",
		"ordinal": 102,
		"enableFlag": "expose_global_message_channel",
		"disableFlag": "no_expose_global_message_channel",
		"enableDate": "2025-08-15"
	},
	{
		"fieldName": "enableNodejsHttpServerModules",
		"ordinal": 103,
		"enableFlag": "enable_nodejs_http_server_modules",
		"disableFlag": "disable_nodejs_http_server_modules",
		"impliedBy": [
			{
				"names": [
					"enableNodejsHttpModules"
				],
				"date": "2025-09-01"
			}
		]
	},
	{
		"fieldName": "pythonNoGlobalHandlers",
		"ordinal": 104,
		"enableFlag": "python_no_global_handlers",
		"disableFlag": "disable_python_no_global_handlers",
		"enableDate": "2025-08-14"
	},
	{
		"fieldName": "enableNodeJsFsModule",
		"ordinal": 105,
		"enableFlag": "enable_nodejs_fs_module",
		"disableFlag": "disable_nodejs_fs_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-09-15"
			}
		]
	},
	{
		"fieldName": "enableNodeJsOsModule",
		"ordinal": 106,
		"enableFlag": "enable_nodejs_os_module",
		"disableFlag": "disable_nodejs_os_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-09-15"
			}
		]
	},
	{
		"fieldName": "pythonWorkersForceNewVendorPath",
		"ordinal": 107,
		"enableFlag": "python_workers_force_new_vendor_path",
		"enableDate": "2025-08-11"
	},
	{
		"fieldName": "removeNodejsCompatEOL",
		"ordinal": 108,
		"enableFlag": "remove_nodejs_compat_eol",
		"disableFlag": "add_nodejs_compat_eol",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-09-01"
			}
		]
	},
	{
		"fieldName": "enableWorkflowScriptValidation",
		"ordinal": 109,
		"enableFlag": "enable_validate_workflow_entrypoint",
		"disableFlag": "disable_validate_workflow_entrypoint",
		"enableDate": "2025-09-20"
	},
	{
		"fieldName": "pythonDedicatedSnapshot",
		"ordinal": 110,
		"enableFlag": "python_dedicated_snapshot",
		"disableFlag": "disable_python_dedicated_snapshot",
		"impliedBy": [
			{
				"names": [
					"pythonWorkers20250116"
				],
				"date": "2025-10-16"
			}
		]
	},
	{
		"fieldName": "typescriptStripTypes",
		"ordinal": 111,
		"enableFlag": "typescript_strip_types",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsHttp2Module",
		"ordinal": 112,
		"enableFlag": "enable_nodejs_http2_module",
		"disableFlag": "disable_nodejs_http2_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-09-01"
			}
		]
	},
	{
		"fieldName": "experimentalAllowEvalAlways",
		"ordinal": 113,
		"enableFlag": "allow_insecure_inefficient_logged_eval",
		"experimental": true
	},
	{
		"fieldName": "stripAuthorizationOnCrossOriginRedirect",
		"ordinal": 114,
		"enableFlag": "strip_authorization_on_cross_origin_redirect",
		"disableFlag": "retain_authorization_on_cross_origin_redirect",
		"enableDate": "2025-09-01"
	},
	{
		"fieldName": "enhancedErrorSerialization",
		"ordinal": 115,
		"enableFlag": "enhanced_error_serialization",
		"disableFlag": "legacy_error_serialization",
		"experimental": true
	},
	{
		"fieldName": "emailSendingQueuing",
		"ordinal": 116,
		"enableFlag": "enable_email_sending_queuing",
		"disableFlag": "disable_email_sending_queuing"
	},
	{
		"fieldName": "removeNodejsCompatEOLv22",
		"ordinal": 117,
		"enableFlag": "remove_nodejs_compat_eol_v22",
		"disableFlag": "add_nodejs_compat_eol_v22",
		"impliedBy": [
			{
				"names": [
					"removeNodejsCompatEOL"
				],
				"date": "2027-04-30"
			}
		]
	},
	{
		"fieldName": "removeNodejsCompatEOLv23",
		"ordinal": 118,
		"enableFlag": "remove_nodejs_compat_eol_v23",
		"disableFlag": "add_nodejs_compat_eol_v23",
		"impliedBy": [
			{
				"names": [
					"removeNodejsCompatEOLv24"
				],
				"date": "2025-09-01"
			}
		]
	},
	{
		"fieldName": "removeNodejsCompatEOLv24",
		"ordinal": 119,
		"enableFlag": "remove_nodejs_compat_eol_v24",
		"disableFlag": "add_nodejs_compat_eol_v24",
		"impliedBy": [
			{
				"names": [
					"removeNodejsCompatEOL"
				],
				"date": "2028-04-30"
			}
		]
	},
	{
		"fieldName": "enableNodeJsConsoleModule",
		"ordinal": 120,
		"enableFlag": "enable_nodejs_console_module",
		"disableFlag": "disable_nodejs_console_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-09-21"
			}
		]
	},
	{
		"fieldName": "enableNodeJsVmModule",
		"ordinal": 121,
		"enableFlag": "enable_nodejs_vm_module",
		"disableFlag": "disable_nodejs_vm_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-10-01"
			}
		]
	},
	{
		"fieldName": "enableNodeJsPerfHooksModule",
		"ordinal": 122,
		"enableFlag": "enable_nodejs_perf_hooks_module",
		"disableFlag": "disable_nodejs_perf_hooks_module",
		"experimental": true
	},
	{
		"fieldName": "enableGlobalPerformanceClasses",
		"ordinal": 123,
		"enableFlag": "enable_global_performance_classes",
		"disableFlag": "disable_global_performance_classes",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsDomainModule",
		"ordinal": 124,
		"enableFlag": "enable_nodejs_domain_module",
		"disableFlag": "disable_nodejs_domain_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-12-04"
			}
		]
	},
	{
		"fieldName": "enableNodeJsV8Module",
		"ordinal": 125,
		"enableFlag": "enable_nodejs_v8_module",
		"disableFlag": "disable_nodejs_v8_module",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsTtyModule",
		"ordinal": 126,
		"enableFlag": "enable_nodejs_tty_module",
		"disableFlag": "disable_nodejs_tty_module",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsPunycodeModule",
		"ordinal": 127,
		"enableFlag": "enable_nodejs_punycode_module",
		"disableFlag": "disable_nodejs_punycode_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-12-04"
			}
		]
	},
	{
		"fieldName": "enableNodeJsClusterModule",
		"ordinal": 128,
		"enableFlag": "enable_nodejs_cluster_module",
		"disableFlag": "disable_nodejs_cluster_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-12-04"
			}
		]
	},
	{
		"fieldName": "enableNodeJsChildProcessModule",
		"ordinal": 129,
		"enableFlag": "enable_nodejs_child_process_module",
		"disableFlag": "disable_nodejs_child_process_module",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsWorkerThreadsModule",
		"ordinal": 130,
		"enableFlag": "enable_nodejs_worker_threads_module",
		"disableFlag": "disable_nodejs_worker_threads_module",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsStreamWrapModule",
		"ordinal": 131,
		"enableFlag": "enable_nodejs_stream_wrap_module",
		"disableFlag": "disable_nodejs_stream_wrap_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2026-01-29"
			}
		]
	},
	{
		"fieldName": "enableNodeJsWasiModule",
		"ordinal": 132,
		"enableFlag": "enable_nodejs_wasi_module",
		"disableFlag": "disable_nodejs_wasi_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-12-04"
			}
		]
	},
	{
		"fieldName": "enableNodeJsDgramModule",
		"ordinal": 133,
		"enableFlag": "enable_nodejs_dgram_module",
		"disableFlag": "disable_nodejs_dgram_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2026-01-29"
			}
		]
	},
	{
		"fieldName": "enableNodeJsInspectorModule",
		"ordinal": 134,
		"enableFlag": "enable_nodejs_inspector_module",
		"disableFlag": "disable_nodejs_inspector_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2026-01-29"
			}
		]
	},
	{
		"fieldName": "enableNodeJsTraceEventsModule",
		"ordinal": 135,
		"enableFlag": "enable_nodejs_trace_events_module",
		"disableFlag": "disable_nodejs_trace_events_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2025-12-04"
			}
		]
	},
	{
		"fieldName": "enableNodeJsReadlineModule",
		"ordinal": 136,
		"enableFlag": "enable_nodejs_readline_module",
		"disableFlag": "disable_nodejs_readline_module",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsReplModule",
		"ordinal": 137,
		"enableFlag": "enable_nodejs_repl_module",
		"disableFlag": "disable_nodejs_repl_module",
		"experimental": true
	},
	{
		"fieldName": "enableNodeJsSqliteModule",
		"ordinal": 138,
		"enableFlag": "enable_nodejs_sqlite_module",
		"disableFlag": "disable_nodejs_sqlite_module",
		"impliedBy": [
			{
				"names": [
					"nodeJsCompat"
				],
				"date": "2026-01-29"
			}
		]
	},
	{
		"fieldName": "enableCtxExports",
		"ordinal": 139,
		"enableFlag": "enable_ctx_exports",
		"disableFlag": "disable_ctx_exports",
		"enableDate": "2025-11-17"
	},
	{
		"fieldName": "pythonExternalSDK",
		"ordinal": 140,
		"enableFlag": "enable_python_external_sdk",
		"disableFlag": "disable_python_external_sdk",
		"experimental": true
	},
	{
		"fieldName": "fastJsgStruct",
		"ordinal": 141,
		"enableFlag": "enable_fast_jsg_struct",
		"disableFlag": "disable_fast_jsg_struct",
		"enableDate": "2025-12-03"
	},
	{
		"fieldName": "cacheReload",
		"ordinal": 142,
		"enableFlag": "cache_reload_enabled",
		"disableFlag": "cache_reload_disabled",
		"experimental": true
	},
	{
		"fieldName": "streamsNodejsV24Compat",
		"ordinal": 143,
		"enableFlag": "enable_streams_nodejs_v24_compat",
		"disableFlag": "disable_streams_nodejs_v24_compat"
	},
	{
		"fieldName": "shouldSetImmutablePrototype",
		"ordinal": 145,
		"enableFlag": "immutable_api_prototypes",
		"disableFlag": "mutable_api_prototypes"
	},
	{
		"fieldName": "fetchIterableTypeSupport",
		"ordinal": 146,
		"enableFlag": "fetch_iterable_type_support",
		"disableFlag": "no_fetch_iterable_type_support"
	},
	{
		"fieldName": "envModuleNullableSupport",
		"ordinal": 147,
		"enableFlag": "env_module_nullable_support",
		"disableFlag": "no_env_module_nullable_support"
	},
	{
		"fieldName": "preciseTimers",
		"ordinal": 148,
		"enableFlag": "precise_timers",
		"disableFlag": "no_precise_timers",
		"experimental": true
	},
	{
		"fieldName": "fetchIterableTypeSupportOverrideAdjustment",
		"ordinal": 149,
		"enableFlag": "fetch_iterable_type_support_override_adjustment",
		"disableFlag": "no_fetch_iterable_type_support_override_adjustment",
		"impliedBy": [
			{
				"names": [
					"fetchIterableTypeSupport"
				],
				"date": "2026-01-15"
			}
		]
	},
	{
		"fieldName": "stripBomInReadAllText",
		"ordinal": 150,
		"enableFlag": "strip_bom_in_read_all_text",
		"disableFlag": "do_not_strip_bom_in_read_all_text",
		"enableDate": "2026-01-13",
		"impliedBy": [
			{
				"names": [
					"pedanticWpt"
				],
				"date": "2026-01-13"
			}
		]
	},
	{
		"fieldName": "allowIrrevocableStubStorage",
		"ordinal": 151,
		"enableFlag": "allow_irrevocable_stub_storage",
		"experimental": true
	},
	{
		"fieldName": "rpcParamsDupStubs",
		"ordinal": 152,
		"enableFlag": "rpc_params_dup_stubs",
		"disableFlag": "rpc_params_transfer_stubs",
		"enableDate": "2026-01-20"
	},
	{
		"fieldName": "enableNodejsGlobalTimers",
		"ordinal": 153,
		"enableFlag": "enable_nodejs_global_timers",
		"disableFlag": "no_nodejs_global_timers",
		"experimental": true
	}
];
