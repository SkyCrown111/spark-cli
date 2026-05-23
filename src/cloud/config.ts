import type { SparkCLIConfig } from '../config/schema.js';
import { DEFAULT_CLOUD_ENDPOINT } from './paths.js';
import { isCloudLoggedIn } from './session.js';

export function getCloudEndpoint(config: SparkCLIConfig): string {
  return process.env.SPARK_CLI_CLOUD_ENDPOINT ?? config.cloud?.endpoint ?? DEFAULT_CLOUD_ENDPOINT;
}

export function isCloudKeysEnabled(config: SparkCLIConfig): boolean {
  return config.cloud?.useCloudKeys === true && isCloudLoggedIn();
}
