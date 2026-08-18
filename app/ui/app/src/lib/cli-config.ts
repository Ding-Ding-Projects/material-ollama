export interface CommandFlagCapability {
  name: string;
  shorthand?: string;
  type: "boolean" | "number" | "list" | "string";
  defaultValue?: string;
  noOptDefVal?: string;
  usage?: string;
  persistent: boolean;
}

export interface CommandCapability {
  id: string;
  name: string;
  use: string;
  description?: string;
  aliases?: string[];
  hidden: boolean;
  guiRoute: string;
  flags?: CommandFlagCapability[];
}

export interface CapabilityRegistry {
  schemaVersion: number;
  cliName: string;
  commands: CommandCapability[];
  configuration: ConfigurationOption[];
}

export type ConfigurationSource =
  | "default"
  | "environment"
  | "config"
  | "environment+config";

export interface ConfigurationOption {
  name: string;
  type: "boolean" | "number" | "list" | "string";
  description?: string;
  effectiveValue?: string;
  source: ConfigurationSource;
  editable: boolean;
  restartRequired: boolean;
}

export interface ConfigProfile {
  id: string;
  name: string;
  description?: string;
  values: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigProfilesResponse {
  schemaVersion: number;
  activeProfile?: string;
  profiles: ConfigProfile[];
  configuration: ConfigurationOption[];
}

export interface ConfigProfileRequest {
  name: string;
  description?: string;
  values: Record<string, string>;
}

export interface ConfigProfileApplyResponse {
  profile: ConfigProfile;
  activeProfile: string;
  restartRequested: boolean;
}
