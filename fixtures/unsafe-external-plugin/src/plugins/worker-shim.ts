/**
 * ESBuild will build the Workers from '../workers' and provide the built script
 * files as variables on the global scope.
 */
declare module "worker:*" {
    export default function (): string;
}
