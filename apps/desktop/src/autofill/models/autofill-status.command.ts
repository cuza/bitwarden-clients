import { AutofillCommandDefinition, AutofillCommandOutput } from "./autofill-command";

export interface AutofillStatusCommand extends AutofillCommandDefinition {
  name: "status";
  input: AutofillStatusParams;
  output: AutofillStatusResult;
}

export type AutofillStatusParams = Record<string, never>;

export type AutofillStatusResult = AutofillCommandOutput<{
  support: {
    fido2: boolean;
    password: boolean;
    /** macOS 15+ can suggest one-time codes. */
    oneTimeCode?: boolean;
    incrementalUpdates: boolean;
  };
  state: {
    enabled: boolean;
  };
}>;
