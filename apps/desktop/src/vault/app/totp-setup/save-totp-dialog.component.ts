import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";

import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import {
  AsyncActionsModule,
  ButtonModule,
  CalloutModule,
  DIALOG_DATA,
  DialogModule,
  DialogRef,
  DialogService,
  FormFieldModule,
  RadioButtonModule,
  SearchModule,
  TypographyModule,
} from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

import { OtpAuthLink } from "./otpauth-link";

/** The dialog's result when the user chooses to save the code to a new login. */
export const NEW_LOGIN = "new";

export type SaveTotpDialogParams = {
  link: OtpAuthLink;
  /** Logins the code can be saved to, best match first. */
  logins: CipherView[];
  /** The login to preselect, if one clearly matches the link. */
  suggestedCipherId?: string;
};

/**
 * Asks where to save the key from a one-time code setup link. Closes with a
 * cipher ID, {@link NEW_LOGIN}, or `undefined` if the user cancels.
 */
@Component({
  templateUrl: "save-totp-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncActionsModule,
    ButtonModule,
    CalloutModule,
    DialogModule,
    FormFieldModule,
    I18nPipe,
    RadioButtonModule,
    ReactiveFormsModule,
    SearchModule,
    TypographyModule,
  ],
})
export class SaveTotpDialogComponent {
  protected readonly params = inject<SaveTotpDialogParams>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<string>>(DialogRef);
  protected readonly NEW_LOGIN = NEW_LOGIN;

  protected readonly serviceName = [this.params.link.issuer, this.params.link.account]
    .filter(Boolean)
    .join(" – ");

  protected readonly search = new FormControl("", { nonNullable: true });
  private readonly query = toSignal(this.search.valueChanges, { initialValue: "" });

  protected readonly target = new FormControl(this.params.suggestedCipherId ?? NEW_LOGIN, {
    nonNullable: true,
  });
  private readonly targetValue = toSignal(this.target.valueChanges, {
    initialValue: this.target.value,
  });

  /** Logins matching the search by name, username or website; the chosen one always stays listed. */
  protected readonly visibleLogins = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return this.params.logins;
    }
    return this.params.logins.filter(
      (cipher) =>
        cipher.id === this.targetValue() ||
        [cipher.name, cipher.login.username, ...(cipher.login.uris ?? []).map((u) => u.hostname)]
          .filter((value): value is string => !!value)
          .some((value) => value.toLowerCase().includes(query)),
    );
  });

  /** Whether saving would overwrite a key the chosen login already has. */
  protected readonly replacesKey = computed(
    () => !!this.params.logins.find((cipher) => cipher.id === this.targetValue())?.login.totp,
  );

  static open(dialogService: DialogService, data: SaveTotpDialogParams) {
    return dialogService.open<string, SaveTotpDialogParams>(SaveTotpDialogComponent, { data });
  }

  protected readonly submit = async () => {
    await this.dialogRef.close(this.target.value);
  };
}
