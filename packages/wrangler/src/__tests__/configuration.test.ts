import path from "node:path";
import { normalizeAndValidateConfig } from "../config/validation";
import type { RawConfig, RawEnvironment } from "../config";

describe("normalizeAndValidateConfig()", () => {
  it("should use defaults for empty configuration", () => {
    const { config, diagnostics } = normalizeAndValidateConfig({}, undefined);

    expect(config).toEqual({
      account_id: undefined,
      build: {
        command: undefined,
        cwd: undefined,
        watch_dir: undefined,
      },
      compatibility_date: undefined,
      compatibility_flags: [],
      configPath: undefined,
      dev: {
        ip: "127.0.0.1",
        local_protocol: "http",
        port: 8787,
        upstream_protocol: "https",
        host: undefined,
      },
      durable_objects: {
        bindings: [],
      },
      env: {},
      jsx_factory: "React.createElement",
      jsx_fragment: "React.Fragment",
      kv_namespaces: [],
      legacy_env: true,
      main: undefined,
      migrations: [],
      name: undefined,
      r2_buckets: [],
      route: undefined,
      routes: undefined,
      rules: [],
      site: undefined,
      text_blobs: undefined,
      triggers: {
        crons: [],
      },
      unsafe: {
        bindings: [],
      },
      usage_model: undefined,
      vars: {},
      wasm_modules: undefined,
      workers_dev: true,
      zone_id: undefined,
    });
    expect(diagnostics.hasErrors()).toBe(false);
    expect(diagnostics.hasWarnings()).toBe(false);
  });

  describe("top-level non-environment configuration", () => {
    it("should override config defaults with provided values", () => {
      const main = "src/index.ts";
      const expectedConfig: RawConfig = {
        main,
        legacy_env: true,
        dev: {
          ip: "255.255.255.255",
          port: 9999,
          local_protocol: "https",
          upstream_protocol: "http",
        },
        build: {
          command: "COMMAND",
          cwd: "CWD",
          watch_dir: "WATCH_DIR",
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig,
        undefined
      );

      const resolvedMain = path.resolve(process.cwd(), main);
      expect(config).toEqual(
        expect.objectContaining({ ...expectedConfig, main: resolvedMain })
      );
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.hasWarnings()).toBe(false);
    });

    it("should error on invalid top level fields", () => {
      const expectedConfig = {
        main: 111,
        legacy_env: "FOO",
        dev: {
          ip: 222,
          port: "FOO",
          local_protocol: "wss",
          upstream_protocol: "ws",
        },
        build: {
          command: 555,
          cwd: 666,
          watch_dir: 777,
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig as unknown as RawConfig,
        undefined
      );

      expect(config).toEqual(
        expect.objectContaining({ ...expectedConfig, main: undefined })
      );
      expect(diagnostics.hasWarnings()).toBe(false);
      expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
        "Processing wrangler configuration:
          - Expected \\"build.command\\" to be of type string but got 555.
          - Expected \\"build.cwd\\" to be of type string but got 666.
          - Expected \\"build.watch_dir\\" to be of type string but got 777.
          - Expected \\"legacy_env\\" to be of type boolean but got \\"FOO\\".
          - Expected \\"main\\" to be a string but got 111
          - Expected \\"dev.ip\\" to be of type string but got 222.
          - Expected \\"dev.port\\" to be of type number but got \\"FOO\\".
          - Expected \\"dev.local_protocol\\" field to be one of [\\"http\\",\\"https\\"] but got \\"wss\\".
          - Expected \\"dev.upstream_protocol\\" field to be one of [\\"http\\",\\"https\\"] but got \\"ws\\"."
      `);
    });

    it("should warn on and remove unexpected top level fields", () => {
      const expectedConfig = {
        miniflare: {
          host: "127.0.0.1",
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig as unknown as RawConfig,
        undefined
      );

      expect("miniflare" in config).toBe(false);
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
        "Processing wrangler configuration:
          - Unexpected fields found in top-level field: \\"miniflare\\""
      `);
    });

    it("should override build.upload config defaults with provided values and warn about deprecations", () => {
      const expectedConfig: RawConfig = {
        build: {
          upload: {
            dir: "src",
            format: "modules",
            main: "index.ts",
            rules: [{ type: "Text", globs: ["GLOB"], fallthrough: true }],
          },
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig,
        path.resolve("project/wrangler.toml")
      );

      expect(config.main).toEqual(path.resolve("project/src/index.ts"));
      expect(config.build.upload).toBeUndefined();
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.hasWarnings()).toBe(true);
      expect(normalizePath(diagnostics.renderWarnings()))
        .toMatchInlineSnapshot(`
        "Processing project/wrangler.toml configuration:
          - DEPRECATION: \\"build.upload.format\\":
            The format is inferred automatically from the code.
          - DEPRECATION: \\"build.upload.main\\":
            Delete the \`build.upload.main\` and \`build.upload.dir\` fields.
            Then add the top level \`main\` field to your configuration file:
            \`\`\`
            main = \\"src/index.ts\\"
            \`\`\`
          - DEPRECATION: \\"build.upload.dir\\":
            Use the top level \\"main\\" field or a command-line argument to specify the entry-point for the Worker.
          - DEPRECATION: The \`build.upload.rules\` config field is no longer used, the rules should be specified via the \`rules\` config field. Delete the \`build.upload\` field from the configuration file, and add this:
            \`\`\`
            [[rules]]
            type = \\"Text\\"
            globs = [ \\"GLOB\\" ]
            fallthrough = true
            \`\`\`"
      `);
    });

    it("should override `migrations` config defaults with provided values", () => {
      const expectedConfig: RawConfig = {
        migrations: [
          {
            tag: "TAG",
            new_classes: ["CLASS_1", "CLASS_2"],
            renamed_classes: [
              {
                from: "FROM_CLASS",
                to: "TO_CLASS",
              },
            ],
            deleted_classes: ["CLASS_3", "CLASS_4"],
          },
        ],
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig,
        undefined
      );

      expect(config).toEqual(expect.objectContaining(expectedConfig));
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.hasWarnings()).toBe(false);
    });

    it("should error on invalid `migrations` values", () => {
      const expectedConfig = {
        migrations: [
          {
            tag: 111,
            new_classes: [222, 333],
            renamed_classes: [
              {
                from: 444,
                to: 555,
              },
            ],
            deleted_classes: [666, 777],
          },
        ],
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig as unknown as RawConfig,
        undefined
      );

      expect(config).toEqual(expect.objectContaining(expectedConfig));
      expect(diagnostics.hasWarnings()).toBe(false);
      expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
        "Processing wrangler configuration:
          - Expected \\"migrations[0].tag\\" to be of type string but got 111.
          - Expected \\"migrations[0].new_classes.[0]\\" to be of type string but got 222.
          - Expected \\"migrations[0].new_classes.[1]\\" to be of type string but got 333.
          - Expected \\"migrations[0].renamed_classes\\" to be an array of \\"{from: string, to: string}\\" objects but got [{\\"from\\":444,\\"to\\":555}].
          - Expected \\"migrations[0].deleted_classes.[0]\\" to be of type string but got 666.
          - Expected \\"migrations[0].deleted_classes.[1]\\" to be of type string but got 777."
      `);
    });

    describe("site", () => {
      it("should override `site` config defaults with provided values", () => {
        const expectedConfig: RawConfig = {
          site: {
            bucket: "BUCKET",
            include: ["INCLUDE_1", "INCLUDE_2"],
            exclude: ["EXCLUDE_1", "EXCLUDE_2"],
          },
        };

        const { config, diagnostics } = normalizeAndValidateConfig(
          expectedConfig,
          undefined
        );

        expect(config).toEqual(expect.objectContaining(expectedConfig));
        expect(diagnostics.hasErrors()).toBe(false);
        expect(diagnostics.hasWarnings()).toBe(false);
      });

      it("should error if `site` config is missing `bucket`", () => {
        const expectedConfig: RawConfig = {
          // @ts-expect-error we're intentionally passing an invalid configuration here
          site: {
            include: ["INCLUDE_1", "INCLUDE_2"],
            exclude: ["EXCLUDE_1", "EXCLUDE_2"],
          },
        };

        const { config, diagnostics } = normalizeAndValidateConfig(
          expectedConfig,
          undefined
        );

        expect(config).toEqual(expect.objectContaining(expectedConfig));
        expect(diagnostics.hasErrors()).toBe(true);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:
            - \\"site.bucket\\" is a required field."
        `);
        expect(diagnostics.hasWarnings()).toBe(false);
      });

      it("should error on invalid `site` values", () => {
        const expectedConfig = {
          site: {
            bucket: "BUCKET",
            include: [222, 333],
            exclude: [444, 555],
          },
        };

        const { config, diagnostics } = normalizeAndValidateConfig(
          expectedConfig as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(expect.objectContaining(expectedConfig));
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:
            - Expected \\"sites.include.[0]\\" to be of type string but got 222.
            - Expected \\"sites.include.[1]\\" to be of type string but got 333.
            - Expected \\"sites.exclude.[0]\\" to be of type string but got 444.
            - Expected \\"sites.exclude.[1]\\" to be of type string but got 555."
        `);
      });

      it("should error with a deprecation warning if entry-point is defined", async () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            site: {
              bucket: "some/path",
              "entry-point": "some/other/script.js",
            },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.site).toMatchInlineSnapshot(`
          Object {
            "bucket": "some/path",
            "exclude": Array [],
            "include": Array [],
          }
        `);
        expect(diagnostics.hasWarnings()).toBe(true);
        expect(diagnostics.hasErrors()).toBe(true);
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:
            - Unexpected fields found in site field: \\"entry-point\\""
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:
            - DEPRECATION: \\"site.entry-point\\":
              The \`site.entry-point\` config field is no longer used.
              The entry-point should be specified via the command line or the \`main\` config field."
        `);
      });
    });

    it("should map `wasm_module` paths from relative to the config path to relative to the cwd", () => {
      const expectedConfig: RawConfig = {
        wasm_modules: {
          MODULE_1: "path/to/module_1.mjs",
          MODULE_2: "module_2.mjs",
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig,
        "project/wrangler.toml"
      );

      expect(config).toEqual(
        expect.objectContaining({
          wasm_modules: {
            MODULE_1: path.normalize("project/path/to/module_1.mjs"),
            MODULE_2: path.normalize("project/module_2.mjs"),
          },
        })
      );
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.hasWarnings()).toBe(false);
    });

    it("should error on invalid `wasm_module` paths", () => {
      const expectedConfig = {
        wasm_modules: {
          MODULE_1: 111,
          MODULE_2: 222,
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig as unknown as RawConfig,
        "project/wrangler.toml"
      );

      expect(config).toEqual(
        expect.objectContaining({
          wasm_modules: {},
        })
      );
      expect(diagnostics.hasWarnings()).toBe(false);
      expect(normalizePath(diagnostics.renderErrors())).toMatchInlineSnapshot(`
          "Processing project/wrangler.toml configuration:
            - Expected \\"wasm_modules['MODULE_1']\\" field to be a string but got 111.
            - Expected \\"wasm_modules['MODULE_2']\\" field to be a string but got 222."
        `);
    });

    it("should map `text_blobs` paths from relative to the config path to relative to the cwd", () => {
      const expectedConfig: RawConfig = {
        text_blobs: {
          BLOB_1: "path/to/text1.txt",
          BLOB_2: "text2.md",
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig,
        "project/wrangler.toml"
      );

      expect(config).toEqual(
        expect.objectContaining({
          text_blobs: {
            BLOB_1: path.normalize("project/path/to/text1.txt"),
            BLOB_2: path.normalize("project/text2.md"),
          },
        })
      );
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.hasWarnings()).toBe(false);
    });

    it("should error on invalid `text_blob` paths", () => {
      const expectedConfig = {
        text_blobs: {
          MODULE_1: 111,
          MODULE_2: 222,
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig as unknown as RawConfig,
        "project/wrangler.toml"
      );

      expect(config).toEqual(
        expect.objectContaining({
          text_blobs: {},
        })
      );
      expect(diagnostics.hasWarnings()).toBe(false);
      expect(normalizePath(diagnostics.renderErrors())).toMatchInlineSnapshot(`
          "Processing project/wrangler.toml configuration:
            - Expected \\"text_blobs['MODULE_1']\\" field to be a string but got 111.
            - Expected \\"text_blobs['MODULE_2']\\" field to be a string but got 222."
        `);
    });

    describe("(deprecated)", () => {
      it("should remove and warn about deprecated properties", () => {
        const rawConfig: RawConfig = {
          type: "webpack",
          webpack_config: "CONFIG",
        };

        const { config, diagnostics } = normalizeAndValidateConfig(
          rawConfig,
          undefined
        );

        // Note the `.not.` here...
        expect(config).toEqual(
          expect.not.objectContaining({
            type: expect.anything(),
            webpack_config: expect.anything(),
          })
        );
        expect(diagnostics.hasErrors()).toBe(false);
        expect(diagnostics.hasWarnings()).toBe(true);
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
            "Processing wrangler configuration:
              - DEPRECATION: \\"type\\":
                DO NOT USE THIS. Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.
              - DEPRECATION: \\"webpack_config\\":
                DO NOT USE THIS. Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build."
          `);
      });
    });
  });

  describe("top-level environment configuration", () => {
    it("should override config defaults with provided values", () => {
      const expectedConfig: RawConfig = {
        name: "NAME",
        account_id: "ACCOUNT_ID",
        compatibility_date: "2022-01-01",
        compatibility_flags: ["FLAG1", "FLAG2"],
        workers_dev: false,
        routes: ["ROUTE_1", "ROUTE_2"],
        route: "ROUTE_3",
        jsx_factory: "JSX_FACTORY",
        jsx_fragment: "JSX_FRAGMENT",
        triggers: { crons: ["CRON_1", "CRON_2"] },
        usage_model: "bundled",
        vars: {
          VAR1: "VALUE_1",
          VAR2: "VALUE_2",
        },
        durable_objects: {
          bindings: [
            { name: "DO_BINDING_1", class_name: "CLASS1" },
            {
              name: "DO_BINDING_2",
              class_name: "CLASS2",
              script_name: "SCRIPT2",
            },
          ],
        },
        kv_namespaces: [
          { binding: "KV_BINDING_1", id: "KV_ID_1" },
          {
            binding: "KV_BINDING_2",
            id: "KV_ID_2",
            preview_id: "KV_PREVIEW_1",
          },
        ],
        r2_buckets: [
          { binding: "R2_BINDING_1", bucket_name: "R2_BUCKET_1" },
          {
            binding: "R2_BINDING_2",
            bucket_name: "R2_BUCKET_2",
            preview_bucket_name: "R2_PREVIEW_2",
          },
        ],
        unsafe: {
          bindings: [
            { name: "UNSAFE_BINDING_1", type: "UNSAFE_TYPE_1" },
            {
              name: "UNSAFE_BINDING_2",
              type: "UNSAFE_TYPE_2",
              extra: "UNSAFE_EXTRA_1",
            },
          ],
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig,
        undefined
      );

      expect(config).toEqual(expect.objectContaining(expectedConfig));
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:
            - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
    });

    it("should error on invalid environment values", () => {
      const expectedConfig: RawConfig = {
        name: 111,
        account_id: 222,
        compatibility_date: 333,
        compatibility_flags: [444, 555],
        workers_dev: "BAD",
        routes: [666, 777],
        route: 888,
        jsx_factory: 999,
        jsx_fragment: 1000,
        triggers: { crons: [1111, 1222] },
        usage_model: "INVALID",
      } as unknown as RawConfig;

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig,
        undefined
      );

      expect(config).toEqual(expect.objectContaining(expectedConfig));
      expect(diagnostics.hasWarnings()).toBe(false);
      expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
        "Processing wrangler configuration:
          - Expected \\"route\\" field to be a string but got 888.
          - Expected \\"routes\\" field to be an array of strings but got [666,777].
          - Expected \\"workers_dev\\" field to be a boolean but got \\"BAD\\".
          - Expected \\"account_id\\" field to be a string but got 222.
          - Expected \\"compatibility_date\\" field to be a string but got 333.
          - Expected \\"compatibility_flags\\" field to be an array of strings but got [444,555].
          - Expected \\"jsx_factory\\" field to be a string but got 999.
          - Expected \\"jsx_fragment\\" field to be a string but got 1000.
          - Expected \\"name\\" field to be a string but got 111.
          - Expected \\"usage_model\\" field to be one of [\\"bundled\\",\\"unbound\\"] but got \\"INVALID\\"."
      `);
    });

    describe("durable_objects field", () => {
      it("should error if durable_objects is an array", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: [] } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects\\" should be an object but got []."
              `);
      });

      it("should error if durable_objects is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: "BAD" } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects\\" should be an object but got \\"BAD\\"."
              `);
      });

      it("should error if durable_objects is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: 999 } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects\\" should be an object but got 999."
              `);
      });

      it("should error if durable_objects is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: null } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects\\" should be an object but got null."
              `);
      });

      it("should error if durable_objects.bindings is not defined", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: {} } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects\\" is missing the required \\"bindings\\" property."
              `);
      });

      it("should error if durable_objects.bindings is an object", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: { bindings: {} } } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects.bindings\\" should be an array but got {}."
              `);
      });

      it("should error if durable_objects.bindings is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: { bindings: "BAD" } } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects.bindings\\" should be an array but got \\"BAD\\"."
              `);
      });

      it("should error if durable_objects.bindings is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: { bindings: 999 } } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects.bindings\\" should be an array but got 999."
              `);
      });

      it("should error if durable_objects.bindings is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { durable_objects: { bindings: null } } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"durable_objects.bindings\\" should be an array but got null."
              `);
      });

      it("should error if durable_objects.bindings are not valid", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            durable_objects: {
              bindings: [
                {},
                { name: "VALID" },
                { name: 1555, class_name: 1666 },
                {
                  name: 1777,
                  class_name: 1888,
                  script_name: 1999,
                },
              ],
            },
          } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"durable_objects.bindings[0]\\": {}
              - binding should have a string \\"name\\" field.
              - binding should have a string \\"class_name\\" field.

            - \\"durable_objects.bindings[1]\\": {\\"name\\":\\"VALID\\"}
              - binding should have a string \\"class_name\\" field.

            - \\"durable_objects.bindings[2]\\": {\\"name\\":1555,\\"class_name\\":1666}
              - binding should have a string \\"name\\" field.
              - binding should have a string \\"class_name\\" field.

            - \\"durable_objects.bindings[3]\\": {\\"name\\":1777,\\"class_name\\":1888,\\"script_name\\":1999}
              - binding should have a string \\"name\\" field.
              - binding should have a string \\"class_name\\" field.
              - binding should, optionally, have a string \\"script_name\\" field."
        `);
      });
    });

    describe("kv_namespaces field", () => {
      it("should error if kv_namespaces is an object", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { kv_namespaces: {} } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ kv_namespaces: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"kv_namespaces\\" should be an array but got {}."
              `);
      });

      it("should error if kv_namespaces is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { kv_namespaces: "BAD" } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ kv_namespaces: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"kv_namespaces\\" should be an array but got \\"BAD\\"."
              `);
      });

      it("should error if kv_namespaces is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { kv_namespaces: 999 } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ kv_namespaces: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"kv_namespaces\\" should be an array but got 999."
              `);
      });

      it("should error if kv_namespaces is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { kv_namespaces: null } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ kv_namespaces: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"kv_namespaces\\" should be an array but got null."
              `);
      });

      it("should error if kv_namespaces.bindings are not valid", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            kv_namespaces: [
              {},
              { binding: "VALID" },
              { binding: 2000, id: 2111 },
              {
                binding: "KV_BINDING_2",
                id: "KV_ID_2",
                preview_id: 2222,
              },
            ],
          } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            kv_namespaces: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:
            - \\"kv_namespaces[0]\\" bindings should have a string \\"binding\\" field but got {}.
            - \\"kv_namespaces[0]\\" bindings should have a string \\"id\\" field but got {}.
            - \\"kv_namespaces[1]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":\\"VALID\\"}.
            - \\"kv_namespaces[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
            - \\"kv_namespaces[2]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
            - \\"kv_namespaces[3]\\" bindings should, optionally, have a string \\"preview_id\\" field but got {\\"binding\\":\\"KV_BINDING_2\\",\\"id\\":\\"KV_ID_2\\",\\"preview_id\\":2222}."
        `);
      });
    });

    describe("r2_buckets field", () => {
      it("should error if r2_buckets is an object", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { r2_buckets: {} } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ r2_buckets: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"r2_buckets\\" should be an array but got {}."
              `);
      });

      it("should error if r2_buckets is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { r2_buckets: "BAD" } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ r2_buckets: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"r2_buckets\\" should be an array but got \\"BAD\\"."
              `);
      });

      it("should error if r2_buckets is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { r2_buckets: 999 } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ r2_buckets: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"r2_buckets\\" should be an array but got 999."
              `);
      });

      it("should error if r2_buckets is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { r2_buckets: null } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ r2_buckets: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"r2_buckets\\" should be an array but got null."
              `);
      });

      it("should error if r2_buckets.bindings are not valid", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            r2_buckets: [
              {},
              { binding: "R2_BINDING_1" },
              { binding: 2333, bucket_name: 2444 },
              {
                binding: "R2_BINDING_2",
                bucket_name: "R2_BUCKET_2",
                preview_bucket_name: 2555,
              },
            ],
          } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            r2_buckets: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:
            - \\"r2_buckets[0]\\" bindings should have a string \\"binding\\" field but got {}.
            - \\"r2_buckets[0]\\" bindings should have a string \\"bucket_name\\" field but got {}.
            - \\"r2_buckets[1]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_1\\"}.
            - \\"r2_buckets[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2333,\\"bucket_name\\":2444}.
            - \\"r2_buckets[2]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":2333,\\"bucket_name\\":2444}.
            - \\"r2_buckets[3]\\" bindings should, optionally, have a string \\"preview_bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_2\\",\\"bucket_name\\":\\"R2_BUCKET_2\\",\\"preview_bucket_name\\":2555}."
        `);
      });
    });

    describe("unsafe field", () => {
      it("should error if unsafe is an array", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: [] } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe\\" should be an object but got []."
              `);
      });

      it("should error if unsafe is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: "BAD" } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe\\" should be an object but got \\"BAD\\"."
              `);
      });

      it("should error if unsafe is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: 999 } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe\\" should be an object but got 999."
              `);
      });

      it("should error if unsafe is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: null } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe\\" should be an object but got null."
              `);
      });

      it("should error if unsafe.bindings is not defined", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: {} } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe\\" is missing the required \\"bindings\\" property."
              `);
      });

      it("should error if unsafe.bindings is an object", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: { bindings: {} } } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            unsafe: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe.bindings\\" should be an array but got {}."
              `);
      });

      it("should error if unsafe.bindings is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: { bindings: "BAD" } } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            unsafe: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe.bindings\\" should be an array but got \\"BAD\\"."
              `);
      });

      it("should error if unsafe.bindings is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: { bindings: 999 } } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            unsafe: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe.bindings\\" should be an array but got 999."
              `);
      });

      it("should error if unsafe.bindings is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { unsafe: { bindings: null } } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            unsafe: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - The field \\"unsafe.bindings\\" should be an array but got null."
              `);
      });

      it("should error if durable_objects.bindings are not valid", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            unsafe: {
              bindings: [
                {},
                { name: "UNSAFE_BINDING_1" },
                { name: 2666, type: 2777 },
                {
                  name: "UNSAFE_BINDING_2",
                  type: "UNSAFE_TYPE_2",
                  extra: 2888,
                },
              ],
            },
          } as unknown as RawConfig,
          undefined
        );

        expect(config).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
                  "Processing wrangler configuration:
                    - \\"unsafe\\" fields are experimental and may change or break at any time."
              `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"unsafe.bindings[0]\\": {}
              - binding should have a string \\"name\\" field.
              - binding should have a string \\"type\\" field.

            - \\"unsafe.bindings[1]\\": {\\"name\\":\\"UNSAFE_BINDING_1\\"}
              - binding should have a string \\"type\\" field.

            - \\"unsafe.bindings[2]\\": {\\"name\\":2666,\\"type\\":2777}
              - binding should have a string \\"name\\" field.
              - binding should have a string \\"type\\" field."
        `);
      });
    });

    describe("(deprecated)", () => {
      it("should remove and warn about deprecated properties", () => {
        const rawConfig: RawConfig = {
          zone_id: "ZONE_ID",
          experimental_services: [
            {
              name: "NAME",
              service: "SERVICE",
              environment: "ENV",
            },
          ],
        };

        const { config, diagnostics } = normalizeAndValidateConfig(
          rawConfig,
          undefined
        );

        expect("experimental_services" in config).toBe(false);
        // Zone is not removed yet, since `route` commands might use it
        expect(config.zone_id).toEqual("ZONE_ID");
        expect(diagnostics.hasErrors()).toBe(false);
        expect(diagnostics.hasWarnings()).toBe(true);
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
            "Processing wrangler configuration:
              - DEPRECATION: \\"zone_id\\":
                This is unnecessary since we can deduce this from routes directly.
              - DEPRECATION: \\"experimental_services\\":
                The \\"experimental_services\\" field is no longer supported. Instead, use [[unsafe.bindings]] to enable experimental features. Add this to your wrangler.toml:
                \`\`\`
                [[unsafe.bindings]]
                name = \\"NAME\\"
                type = \\"service\\"
                service = \\"SERVICE\\"
                environment = \\"ENV\\"
                \`\`\`"
          `);
      });
    });
  });

  describe("named environments", () => {
    it("should use top-level values for inheritable config fields", () => {
      const expectedConfig: RawConfig = {
        name: "NAME",
        account_id: "ACCOUNT_ID",
        compatibility_date: "2022-01-01",
        compatibility_flags: ["FLAG1", "FLAG2"],
        workers_dev: false,
        routes: ["ROUTE_1", "ROUTE_2"],
        route: "ROUTE_3",
        jsx_factory: "JSX_FACTORY",
        jsx_fragment: "JSX_FRAGMENT",
        triggers: { crons: ["CRON_1", "CRON_2"] },
        usage_model: "bundled",
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        { ...expectedConfig, env: { DEV: {} } },
        undefined
      );

      expect(config.env.DEV).toEqual(expect.objectContaining(expectedConfig));
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.hasWarnings()).toBe(false);
    });

    it("should override top-level values for inheritable config fields", () => {
      const environment: RawEnvironment = {
        name: "ENV_NAME",
        account_id: "ENV_ACCOUNT_ID",
        compatibility_date: "2022-02-02",
        compatibility_flags: ["ENV_FLAG1", "ENV_FLAG2"],
        workers_dev: true,
        routes: ["ENV_ROUTE_1", "ENV_ROUTE_2"],
        route: "ENV_ROUTE_3",
        jsx_factory: "ENV_JSX_FACTORY",
        jsx_fragment: "ENV_JSX_FRAGMENT",
        triggers: { crons: ["ENV_CRON_1", "ENV_CRON_2"] },
        usage_model: "unbound",
      };
      const expectedConfig: RawConfig = {
        name: "NAME",
        account_id: "ACCOUNT_ID",
        compatibility_date: "2022-01-01",
        compatibility_flags: ["FLAG1", "FLAG2"],
        workers_dev: false,
        routes: ["ROUTE_1", "ROUTE_2"],
        route: "ROUTE_3",
        jsx_factory: "JSX_FACTORY",
        jsx_fragment: "JSX_FRAGMENT",
        triggers: { crons: ["CRON_1", "CRON_2"] },
        usage_model: "bundled",
        env: {
          ENV1: environment,
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        expectedConfig,
        undefined
      );

      expect(config.env.ENV1).toEqual(expect.objectContaining(environment));
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.hasWarnings()).toBe(false);
    });

    it("should warn for non-inherited fields that are missing in environments", () => {
      const vars: RawConfig["vars"] = {
        FOO: "foo",
      };
      const durable_objects: RawConfig["durable_objects"] = {
        bindings: [],
      };
      const kv_namespaces: RawConfig["kv_namespaces"] = [];
      const r2_buckets: RawConfig["r2_buckets"] = [];
      const unsafe: RawConfig["unsafe"] = { bindings: [] };
      const rawConfig: RawConfig = {
        vars,
        durable_objects,
        kv_namespaces,
        r2_buckets,
        unsafe,
        env: {
          ENV1: {},
        },
      };

      const { config, diagnostics } = normalizeAndValidateConfig(
        rawConfig,
        undefined
      );

      expect(config.env.ENV1).toEqual(
        expect.not.objectContaining({
          vars,
          durable_objects,
          kv_namespaces,
          r2_buckets,
          unsafe,
        })
      );
      expect(diagnostics.hasErrors()).toBe(false);
      expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
        "Processing wrangler configuration:
          - \\"unsafe\\" fields are experimental and may change or break at any time.
          - \\"env.ENV1\\" environment configuration
            - \\"vars\\" exists at the top level, but not on \\"env.ENV1\\".
              This is not what you probably want, since \\"vars\\" is not inherited by environments.
              Please add \\"vars\\" to \\"env.ENV1\\".
            - \\"durable_objects\\" exists at the top level, but not on \\"env.ENV1\\".
              This is not what you probably want, since \\"durable_objects\\" is not inherited by environments.
              Please add \\"durable_objects\\" to \\"env.ENV1\\".
            - \\"kv_namespaces\\" exists at the top level, but not on \\"env.ENV1\\".
              This is not what you probably want, since \\"kv_namespaces\\" is not inherited by environments.
              Please add \\"kv_namespaces\\" to \\"env.ENV1\\".
            - \\"r2_buckets\\" exists at the top level, but not on \\"env.ENV1\\".
              This is not what you probably want, since \\"r2_buckets\\" is not inherited by environments.
              Please add \\"r2_buckets\\" to \\"env.ENV1\\".
            - \\"unsafe\\" exists at the top level, but not on \\"env.ENV1\\".
              This is not what you probably want, since \\"unsafe\\" is not inherited by environments.
              Please add \\"unsafe\\" to \\"env.ENV1\\"."
      `);
    });

    it("should error on invalid environment values", () => {
      const expectedConfig: RawEnvironment = {
        name: 111,
        account_id: 222,
        compatibility_date: 333,
        compatibility_flags: [444, 555],
        workers_dev: "BAD",
        routes: [666, 777],
        route: 888,
        jsx_factory: 999,
        jsx_fragment: 1000,
        triggers: { crons: [1111, 1222] },
        usage_model: "INVALID",
      } as unknown as RawEnvironment;

      const { config, diagnostics } = normalizeAndValidateConfig(
        { env: { ENV1: expectedConfig } },
        undefined
      );

      expect(config.env.ENV1).toEqual(expect.objectContaining(expectedConfig));
      expect(diagnostics.hasWarnings()).toBe(false);
      expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
        "Processing wrangler configuration:

          - \\"env.ENV1\\" environment configuration
            - Expected \\"route\\" field to be a string but got 888.
            - Expected \\"routes\\" field to be an array of strings but got [666,777].
            - Expected \\"workers_dev\\" field to be a boolean but got \\"BAD\\".
            - Expected \\"account_id\\" field to be a string but got 222.
            - Expected \\"compatibility_date\\" field to be a string but got 333.
            - Expected \\"compatibility_flags\\" field to be an array of strings but got [444,555].
            - Expected \\"jsx_factory\\" field to be a string but got 999.
            - Expected \\"jsx_fragment\\" field to be a string but got 1000.
            - Expected \\"name\\" field to be a string but got 111.
            - Expected \\"usage_model\\" field to be one of [\\"bundled\\",\\"unbound\\"] but got \\"INVALID\\"."
      `);
    });

    describe("durable_objects field", () => {
      it("should error if durable_objects is an array", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { durable_objects: [] } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects\\" should be an object but got []."
        `);
      });

      it("should error if durable_objects is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { durable_objects: "BAD" } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects\\" should be an object but got \\"BAD\\"."
        `);
      });

      it("should error if durable_objects is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { durable_objects: 999 } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects\\" should be an object but got 999."
        `);
      });

      it("should error if durable_objects is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { durable_objects: null } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects\\" should be an object but got null."
        `);
      });

      it("should error if durable_objects.bindings is not defined", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { durable_objects: {} } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ durable_objects: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects\\" is missing the required \\"bindings\\" property."
        `);
      });

      it("should error if durable_objects.bindings is an object", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: { ENV1: { durable_objects: { bindings: {} } } },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects.bindings\\" should be an array but got {}."
        `);
      });

      it("should error if durable_objects.bindings is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: { ENV1: { durable_objects: { bindings: "BAD" } } },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects.bindings\\" should be an array but got \\"BAD\\"."
        `);
      });

      it("should error if durable_objects.bindings is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: { ENV1: { durable_objects: { bindings: 999 } } },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects.bindings\\" should be an array but got 999."
        `);
      });

      it("should error if durable_objects.bindings is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: { ENV1: { durable_objects: { bindings: null } } },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.durable_objects.bindings\\" should be an array but got null."
        `);
      });

      it("should error if durable_objects.bindings are not valid", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: {
              ENV1: {
                durable_objects: {
                  bindings: [
                    {},
                    { name: "VALID" },
                    { name: 1555, class_name: 1666 },
                    {
                      name: 1777,
                      class_name: 1888,
                      script_name: 1999,
                    },
                  ],
                },
              },
            },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration

              - \\"env.ENV1.durable_objects.bindings[0]\\": {}
                - binding should have a string \\"name\\" field.
                - binding should have a string \\"class_name\\" field.

              - \\"env.ENV1.durable_objects.bindings[1]\\": {\\"name\\":\\"VALID\\"}
                - binding should have a string \\"class_name\\" field.

              - \\"env.ENV1.durable_objects.bindings[2]\\": {\\"name\\":1555,\\"class_name\\":1666}
                - binding should have a string \\"name\\" field.
                - binding should have a string \\"class_name\\" field.

              - \\"env.ENV1.durable_objects.bindings[3]\\": {\\"name\\":1777,\\"class_name\\":1888,\\"script_name\\":1999}
                - binding should have a string \\"name\\" field.
                - binding should have a string \\"class_name\\" field.
                - binding should, optionally, have a string \\"script_name\\" field."
        `);
      });
    });

    describe("kv_namespaces field", () => {
      it("should error if kv_namespaces is an object", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { kv_namespaces: {} } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ kv_namespaces: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.kv_namespaces\\" should be an array but got {}."
        `);
      });

      it("should error if kv_namespaces is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { kv_namespaces: "BAD" } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ kv_namespaces: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.kv_namespaces\\" should be an array but got \\"BAD\\"."
        `);
      });

      it("should error if kv_namespaces is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { kv_namespaces: 999 } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ kv_namespaces: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.kv_namespaces\\" should be an array but got 999."
        `);
      });

      it("should error if kv_namespaces is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { kv_namespaces: null } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ kv_namespaces: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.kv_namespaces\\" should be an array but got null."
        `);
      });

      it("should error if kv_namespaces.bindings are not valid", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: {
              ENV1: {
                kv_namespaces: [
                  {},
                  { binding: "VALID" },
                  { binding: 2000, id: 2111 },
                  {
                    binding: "KV_BINDING_2",
                    id: "KV_ID_2",
                    preview_id: 2222,
                  },
                ],
              },
            },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            kv_namespaces: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"env.ENV1.kv_namespaces[0]\\" bindings should have a string \\"binding\\" field but got {}.
              - \\"env.ENV1.kv_namespaces[0]\\" bindings should have a string \\"id\\" field but got {}.
              - \\"env.ENV1.kv_namespaces[1]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":\\"VALID\\"}.
              - \\"env.ENV1.kv_namespaces[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
              - \\"env.ENV1.kv_namespaces[2]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
              - \\"env.ENV1.kv_namespaces[3]\\" bindings should, optionally, have a string \\"preview_id\\" field but got {\\"binding\\":\\"KV_BINDING_2\\",\\"id\\":\\"KV_ID_2\\",\\"preview_id\\":2222}."
        `);
      });
    });

    describe("r2_buckets field", () => {
      it("should error if r2_buckets is an object", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { r2_buckets: {} } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ r2_buckets: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.r2_buckets\\" should be an array but got {}."
        `);
      });

      it("should error if r2_buckets is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { r2_buckets: "BAD" } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ r2_buckets: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.r2_buckets\\" should be an array but got \\"BAD\\"."
        `);
      });

      it("should error if r2_buckets is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { r2_buckets: 999 } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ r2_buckets: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.r2_buckets\\" should be an array but got 999."
        `);
      });

      it("should error if r2_buckets is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { r2_buckets: null } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ r2_buckets: expect.anything })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.r2_buckets\\" should be an array but got null."
        `);
      });

      it("should error if r2_buckets.bindings are not valid", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: {
              ENV1: {
                r2_buckets: [
                  {},
                  { binding: "R2_BINDING_1" },
                  { binding: 2333, bucket_name: 2444 },
                  {
                    binding: "R2_BINDING_2",
                    bucket_name: "R2_BUCKET_2",
                    preview_bucket_name: 2555,
                  },
                ],
              },
            },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            r2_buckets: { bindings: expect.anything },
          })
        );
        expect(diagnostics.hasWarnings()).toBe(false);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"env.ENV1.r2_buckets[0]\\" bindings should have a string \\"binding\\" field but got {}.
              - \\"env.ENV1.r2_buckets[0]\\" bindings should have a string \\"bucket_name\\" field but got {}.
              - \\"env.ENV1.r2_buckets[1]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_1\\"}.
              - \\"env.ENV1.r2_buckets[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2333,\\"bucket_name\\":2444}.
              - \\"env.ENV1.r2_buckets[2]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":2333,\\"bucket_name\\":2444}.
              - \\"env.ENV1.r2_buckets[3]\\" bindings should, optionally, have a string \\"preview_bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_2\\",\\"bucket_name\\":\\"R2_BUCKET_2\\",\\"preview_bucket_name\\":2555}."
        `);
      });
    });

    describe("unsafe field", () => {
      it("should error if unsafe is an array", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { unsafe: [] } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe\\" should be an object but got []."
        `);
      });

      it("should error if unsafe is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { unsafe: "BAD" } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe\\" should be an object but got \\"BAD\\"."
        `);
      });

      it("should error if unsafe is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { unsafe: 999 } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe\\" should be an object but got 999."
        `);
      });

      it("should error if unsafe is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { unsafe: null } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe\\" should be an object but got null."
        `);
      });

      it("should error if unsafe.bindings is not defined", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          { env: { ENV1: { unsafe: {} } } } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({ unsafe: expect.anything })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe\\" is missing the required \\"bindings\\" property."
        `);
      });

      it("should error if unsafe.bindings is an object", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: { ENV1: { unsafe: { bindings: {} } } },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            unsafe: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe.bindings\\" should be an array but got {}."
        `);
      });

      it("should error if unsafe.bindings is a string", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: { ENV1: { unsafe: { bindings: "BAD" } } },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            unsafe: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe.bindings\\" should be an array but got \\"BAD\\"."
        `);
      });

      it("should error if unsafe.bindings is a number", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: { ENV1: { unsafe: { bindings: 999 } } },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            unsafe: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe.bindings\\" should be an array but got 999."
        `);
      });

      it("should error if unsafe.bindings is null", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: { ENV1: { unsafe: { bindings: null } } },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            unsafe: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - The field \\"env.ENV1.unsafe.bindings\\" should be an array but got null."
        `);
      });

      it("should error if unsafe.bindings are not valid", () => {
        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: {
              ENV1: {
                unsafe: {
                  bindings: [
                    {},
                    { name: "UNSAFE_BINDING_1" },
                    { name: 2666, type: 2777 },
                    {
                      name: "UNSAFE_BINDING_2",
                      type: "UNSAFE_TYPE_2",
                      extra: 2888,
                    },
                  ],
                },
              },
            },
          } as unknown as RawConfig,
          undefined
        );

        expect(config.env.ENV1).toEqual(
          expect.not.objectContaining({
            durable_objects: { bindings: expect.anything },
          })
        );
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - \\"unsafe\\" fields are experimental and may change or break at any time."
        `);
        expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration

              - \\"env.ENV1.unsafe.bindings[0]\\": {}
                - binding should have a string \\"name\\" field.
                - binding should have a string \\"type\\" field.

              - \\"env.ENV1.unsafe.bindings[1]\\": {\\"name\\":\\"UNSAFE_BINDING_1\\"}
                - binding should have a string \\"type\\" field.

              - \\"env.ENV1.unsafe.bindings[2]\\": {\\"name\\":2666,\\"type\\":2777}
                - binding should have a string \\"name\\" field.
                - binding should have a string \\"type\\" field."
        `);
      });
    });

    describe("(deprecated)", () => {
      it("should remove and warn about deprecated properties", () => {
        const environment: RawEnvironment = {
          zone_id: "ZONE_ID",
          experimental_services: [
            {
              name: "NAME",
              service: "SERVICE",
              environment: "ENV",
            },
          ],
        };

        const { config, diagnostics } = normalizeAndValidateConfig(
          {
            env: {
              ENV1: environment,
            },
          },
          undefined
        );

        expect("experimental_services" in config.env.ENV1).toBe(false);
        // Zone is not removed yet, since `route` commands might use it
        expect(config.env.ENV1.zone_id).toEqual("ZONE_ID");
        expect(diagnostics.hasErrors()).toBe(false);
        expect(diagnostics.hasWarnings()).toBe(true);
        expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
          "Processing wrangler configuration:

            - \\"env.ENV1\\" environment configuration
              - DEPRECATION: \\"zone_id\\":
                This is unnecessary since we can deduce this from routes directly.
              - DEPRECATION: \\"experimental_services\\":
                The \\"experimental_services\\" field is no longer supported. Instead, use [[unsafe.bindings]] to enable experimental features. Add this to your wrangler.toml:
                \`\`\`
                [[unsafe.bindings]]
                name = \\"NAME\\"
                type = \\"service\\"
                service = \\"SERVICE\\"
                environment = \\"ENV\\"
                \`\`\`"
        `);
      });
    });
  });
});

function normalizePath(text: string): string {
  return text
    .replace("project\\wrangler.toml", "project/wrangler.toml")
    .replace("src\\index.ts", "src/index.ts");
}
