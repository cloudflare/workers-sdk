module "command-exists" {
  /**
   * Detect whether a command exists on the system.
   */
  export default function commandExists(cmd: string): Promise<void>;
}
