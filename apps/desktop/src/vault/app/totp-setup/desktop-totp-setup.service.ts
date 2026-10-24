import { Injectable, inject } from "@angular/core";
import { filter, firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { LoginView } from "@bitwarden/common/vault/models/view/login.view";
import { DialogService, ToastService } from "@bitwarden/components";
import { PasswordRepromptService } from "@bitwarden/vault";

import { DesktopSettingsService } from "../../../platform/services/desktop-settings.service";

import { OtpAuthLink, parseOtpAuthLink } from "./otpauth-link";
import { NEW_LOGIN, SaveTotpDialogComponent } from "./save-totp-dialog.component";

/**
 * Saves the key from a one-time code setup link (`otpauth://`), which macOS
 * sends to the app chosen under "Set Up Codes In", e.g. after scanning a QR code.
 */
@Injectable({ providedIn: "root" })
export class DesktopTotpSetupService {
  private readonly accountService = inject(AccountService);
  private readonly authService = inject(AuthService);
  private readonly cipherService = inject(CipherService);
  private readonly desktopSettingsService = inject(DesktopSettingsService);
  private readonly dialogService = inject(DialogService);
  private readonly i18nService = inject(I18nService);
  private readonly logService = inject(LogService);
  private readonly passwordRepromptService = inject(PasswordRepromptService);
  private readonly toastService = inject(ToastService);

  /** Set while a link is being saved, so a website can't stack up dialogs. */
  private busy = false;

  /**
   * Asks the user where to save the key in `uri`, then saves it. Any website can
   * open such a link, so nothing is saved without the user's confirmation.
   */
  async saveFromLink(uri: string): Promise<void> {
    const link = parseOtpAuthLink(uri);
    if (link == null) {
      this.logService.warning("[DesktopTotpSetupService] Ignoring an unsupported otpauth link");
      return;
    }
    if (this.busy) {
      this.logService.warning("[DesktopTotpSetupService] Ignoring a link while another is open");
      return;
    }

    this.busy = true;
    try {
      await this.save(uri, link);
    } catch (e) {
      // The error comes from the server or the vault; the link itself is never logged.
      this.logService.error("[DesktopTotpSetupService] Could not save the verification code", e);
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("errorOccurred"),
      });
    } finally {
      this.busy = false;
    }
  }

  private async save(uri: string, link: OtpAuthLink): Promise<void> {
    ipc.platform.focusWindow();
    // A locked vault shows the lock screen; continue once the user unlocks it.
    await firstValueFrom(
      this.authService.activeAccountStatus$.pipe(
        filter((status) => status === AuthenticationStatus.Unlocked),
      ),
    );
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));

    const logins = rankLogins(
      (await this.cipherService.getAllDecrypted(userId)).filter(
        (cipher) => cipher.type === CipherType.Login && !cipher.isDeleted && cipher.edit,
      ),
      link,
    );
    const best = logins[0];
    const choice = await this.askWhereToSave({
      link,
      logins,
      // Only preselect a login that matches both the site and the account, so a
      // loose match can't overwrite a code by accident, and never one whose key
      // would be replaced: the user has to pick that one themselves.
      suggestedCipherId:
        best && !best.login.totp && matchScore(best, link) === ISSUER_MATCH + ACCOUNT_MATCH
          ? best.id
          : undefined,
    });
    if (choice == null || !(await this.stillActive(userId))) {
      return;
    }

    if (choice === NEW_LOGIN) {
      const cipher = new CipherView();
      cipher.type = CipherType.Login;
      cipher.name = link.issuer ?? link.account ?? this.i18nService.t("verificationCodeTotp");
      cipher.login = new LoginView();
      cipher.login.username = link.account ?? null;
      cipher.login.totp = uri;
      await this.cipherService.createWithServer(cipher, userId);
    } else {
      const cipher = logins.find((c) => c.id === choice);
      if (cipher == null) {
        return;
      }
      if (!(await this.passwordRepromptService.passwordRepromptCheck(cipher))) {
        return;
      }
      cipher.login.totp = uri;
      await this.cipherService.updateWithServer(cipher, userId);
    }

    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t(choice === NEW_LOGIN ? "addedItem" : "editedItem"),
    });
  }

  /**
   * Shows the save dialog. An autofill request takes over the window and closes
   * open dialogs, so the dialog comes back once that request is done.
   */
  private async askWhereToSave(
    params: Parameters<typeof SaveTotpDialogComponent.open>[1],
  ): Promise<string | undefined> {
    for (;;) {
      const choice = await firstValueFrom(
        SaveTotpDialogComponent.open(this.dialogService, params).closed,
      );
      const modalMode = await firstValueFrom(this.desktopSettingsService.modalMode$);
      if (choice != null || !modalMode?.isModalModeActive) {
        return choice;
      }
      await firstValueFrom(
        this.desktopSettingsService.modalMode$.pipe(filter((m) => !m?.isModalModeActive)),
      );
      // Leaving modal mode hides the window.
      ipc.platform.focusWindow();
    }
  }

  /** Whether `userId` is still the active, unlocked account, e.g. after a switch while asking. */
  private async stillActive(userId: UserId): Promise<boolean> {
    const [activeUserId, status] = await Promise.all([
      firstValueFrom(this.accountService.activeAccount$.pipe(getUserId)),
      firstValueFrom(this.authService.activeAccountStatus$),
    ]);
    return activeUserId === userId && status === AuthenticationStatus.Unlocked;
  }
}

const ISSUER_MATCH = 2;
const ACCOUNT_MATCH = 1;

/** The lowercase words in `text`, e.g. "login.example.com" has "login", "example" and "com". */
function words(text: string | undefined | null): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

/**
 * How well a login matches a setup link: the issuer counts more than the account.
 * The issuer must match whole words of the login's name or website, so a link
 * can't match most logins with an issuer like "a".
 */
export function matchScore(cipher: CipherView, link: OtpAuthLink): number {
  const issuerWords = [...words(link.issuer)];
  const account = link.account?.toLowerCase();
  const containsIssuer = (text: string | undefined | null) => {
    const textWords = words(text);
    return issuerWords.every((w) => textWords.has(w));
  };
  const issuerMatches =
    issuerWords.length > 0 &&
    (containsIssuer(cipher.name) ||
      (cipher.login.uris ?? []).some((uri) => containsIssuer(uri.hostname)));
  const accountMatches = !!account && cipher.login.username?.toLowerCase() === account;
  return (issuerMatches ? ISSUER_MATCH : 0) + (accountMatches ? ACCOUNT_MATCH : 0);
}

/** Sorts logins best match first, then by name. */
export function rankLogins(ciphers: CipherView[], link: OtpAuthLink): CipherView[] {
  return ciphers
    .map((cipher) => ({ cipher, score: matchScore(cipher, link) }))
    .sort((a, b) => b.score - a.score || (a.cipher.name ?? "").localeCompare(b.cipher.name ?? ""))
    .map(({ cipher }) => cipher);
}
