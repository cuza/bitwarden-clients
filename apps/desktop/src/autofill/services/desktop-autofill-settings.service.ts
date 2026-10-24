import { map } from "rxjs";

import {
  AUTOFILL_SETTINGS_DISK,
  KeyDefinition,
  StateProvider,
} from "@bitwarden/common/platform/state";

const ENABLE_DUCK_DUCK_GO_BROWSER_INTEGRATION = new KeyDefinition(
  AUTOFILL_SETTINGS_DISK,
  "enableDuckDuckGoBrowserIntegration",
  {
    deserializer: (v: boolean) => v,
  },
);

const REQUIRE_USER_VERIFICATION_FOR_AUTOFILL = new KeyDefinition(
  AUTOFILL_SETTINGS_DISK,
  "requireUserVerificationForNativeAutofill",
  {
    deserializer: (v: boolean) => v,
  },
);

export class DesktopAutofillSettingsService {
  private enableDuckDuckGoBrowserIntegrationState = this.stateProvider.getGlobal(
    ENABLE_DUCK_DUCK_GO_BROWSER_INTEGRATION,
  );
  enableDuckDuckGoBrowserIntegration$ = this.enableDuckDuckGoBrowserIntegrationState.state$.pipe(
    map((x) => x ?? false),
  );

  private requireUserVerificationForAutofillState = this.stateProvider.getGlobal(
    REQUIRE_USER_VERIFICATION_FOR_AUTOFILL,
  );
  /**
   * Whether filling a password or one-time code into another app through the OS
   * asks for Touch ID first, even when the vault is unlocked. Defaults to on.
   */
  requireUserVerificationForAutofill$ = this.requireUserVerificationForAutofillState.state$.pipe(
    map((x) => x ?? true),
  );

  constructor(private stateProvider: StateProvider) {}

  async setEnableDuckDuckGoBrowserIntegration(newValue: boolean): Promise<void> {
    await this.enableDuckDuckGoBrowserIntegrationState.update(() => newValue);
  }

  async setRequireUserVerificationForAutofill(newValue: boolean): Promise<void> {
    await this.requireUserVerificationForAutofillState.update(() => newValue);
  }
}
