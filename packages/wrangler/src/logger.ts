/* eslint-disable no-console */
export class Logger {
  log(...args: unknown[]): void {
    console.log(...args);
  }
  debug(...args: unknown[]): void {
    console.debug(...args);
  }
  info(...args: unknown[]): void {
    console.info(...args);
  }
  warn(...args: unknown[]): void {
    console.warn(...args);
  }
  error(...args: unknown[]): void {
    console.error(...args);
  }
  dir(...args: unknown[]): void {
    console.dir(...args);
  }
  dirxml(...args: unknown[]): void {
    console.dirxml(...args);
  }
  table(...args: unknown[]): void {
    console.table(...args);
  }
  trace(...args: unknown[]): void {
    console.trace(...args);
  }
  clear(): void {
    console.clear();
  }
  count(label?: string): void {
    console.count(label);
  }
  assert(condition?: boolean | undefined, ...data: unknown[]): void {
    console.assert(condition, ...data);
  }
  profile(label?: string): void {
    console.profile(label);
  }
  profileEnd(label?: string): void {
    console.profileEnd(label);
  }
  timeEnd(label?: string): void {
    console.timeEnd(label);
  }
  group(...labels: unknown[]): void {
    console.group(...labels);
  }
  groupCollapsed(...labels: unknown[]): void {
    console.groupCollapsed(...labels);
  }
  groupEnd(): void {
    console.groupEnd();
  }

  get columns() {
    return process.stdout.columns;
  }
}

export const logger = new Logger();
