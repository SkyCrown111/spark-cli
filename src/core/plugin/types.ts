export interface SparkCLIPluginManifest {
  name: string;
  version: string;
  description?: string;
  engines?: string[];
  main?: string;
}

export interface InstalledPlugin {
  name: string;
  version: string;
  path: string;
  description?: string;
  engines?: string[];
}
