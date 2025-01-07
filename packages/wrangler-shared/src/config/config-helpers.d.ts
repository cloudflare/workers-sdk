/**
 * Resolve the path to the configuration file, given the `config` and `script` optional command line arguments.
 * `config` takes precedence, then `script`, then we just use the cwd.
 */
export declare function resolveWranglerConfigPath({ config, script, }: {
    config?: string;
    script?: string;
}): string | undefined;
/**
 * Find the wrangler config file by searching up the file-system
 * from the current working directory.
 */
export declare function findWranglerConfig(referencePath?: string): string | undefined;
