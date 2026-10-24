import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterModule, Router } from "@angular/router";
import { map, combineLatest, of, Observable, switchMap, catchError, startWith } from "rxjs";

import { IconComponent } from "@bitwarden/angular/vault/components/icon.component";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import {
  CipherViewLike,
  CipherViewLikeUtils,
} from "@bitwarden/common/vault/utils/cipher-view-like-utils";
import {
  BadgeModule,
  ButtonModule,
  DialogModule,
  DialogService,
  ItemModule,
  SearchModule,
  SectionComponent,
  TableModule,
  SectionHeaderComponent,
  TypographyModule,
} from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

import { DesktopSettingsService } from "../../../platform/services/desktop-settings.service";
import { DesktopFido2UserInterfaceService } from "../../services/desktop-fido2-user-interface.service";

import { Fido2ModalHeaderComponent } from "./fido2-modal-header.component";
import { Fido2ModalPageComponent } from "./fido2-modal-page.component";

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    SectionHeaderComponent,
    TableModule,
    I18nPipe,
    ButtonModule,
    DialogModule,
    SectionComponent,
    ItemModule,
    BadgeModule,
    IconComponent,
    TypographyModule,
    Fido2ModalHeaderComponent,
    Fido2ModalPageComponent,
    ReactiveFormsModule,
    SearchModule,
  ],
  templateUrl: "fido2-vault.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Fido2VaultComponent {
  private readonly desktopSettingsService = inject(DesktopSettingsService);
  private readonly fido2UserInterfaceService = inject(DesktopFido2UserInterfaceService);
  private readonly cipherService = inject(CipherService);
  private readonly accountService = inject(AccountService);
  private readonly dialogService = inject(DialogService);
  private readonly logService = inject(LogService);
  private readonly router = inject(Router);

  readonly session = this.fido2UserInterfaceService.getCurrentSession();
  protected readonly search = new FormControl("", { nonNullable: true });
  protected readonly titleKey = this.session?.loginFill ? "autofillLogin" : "passkeyLogin2";
  protected readonly headingKey = this.session?.loginFill
    ? "chooseLoginToAutofill"
    : "chooseCipherForPasskeyAuth";
  readonly ciphers$: Observable<CipherViewLike[]> = this.buildCiphers$();
  protected readonly CipherViewLikeUtils = CipherViewLikeUtils;

  async chooseCipher(cipher: CipherViewLike): Promise<void> {
    if (!this.session) {
      await this.dialogService.openSimpleDialog({
        title: { key: "unexpectedErrorShort" },
        content: { key: "closeThisBitwardenWindow" },
        type: "danger",
        acceptButtonText: { key: "closeThisWindow" },
        cancelButtonText: null,
      });
      await this.closeModal();

      return;
    }

    this.session.confirmChosenCipher(cipher);

    await this.closeModal();
  }

  async closeModal(): Promise<void> {
    if (this.session) {
      this.session.notifyConfirmCreateCredential(false);
      this.session.confirmChosenCipher(undefined);
    } else {
      await this.desktopSettingsService.setModalMode(false);
      await this.accountService.setShowHeader(true);
      await this.router.navigate(["/"]);
    }
  }

  private buildCiphers$(): Observable<CipherViewLike[]> {
    return this.accountService.activeAccount$.pipe(
      map((account) => account?.id),
      switchMap((activeUserId) => {
        if (!activeUserId) {
          return of<CipherViewLike[]>([]);
        }

        // Combine the cipher list with the optional cipher IDs filter the
        // session made available for this ceremony.
        return combineLatest([
          this.cipherService.cipherListViews$(activeUserId),
          this.session?.availableCipherIds$ ?? of(null as string[] | null),
          this.search.valueChanges.pipe(startWith(this.search.value)),
        ]).pipe(
          map(([ciphers, cipherIds, query]): CipherViewLike[] => {
            let activeCiphers: CipherViewLike[] = ciphers.filter((cipher) => !cipher.deletedDate);

            if (cipherIds != null && cipherIds.length > 0) {
              activeCiphers = activeCiphers.filter((cipher) => {
                const id = cipher.id?.toString();
                return id != null && cipherIds.includes(id);
              });
            }

            return activeCiphers.filter((cipher) => matchesSearch(cipher, query));
          }),
        );
      }),
      catchError((error: unknown) => {
        this.logService.error("Failed to load ciphers", error);
        return of<CipherViewLike[]>([]);
      }),
    );
  }
}

/** Whether the cipher's name, username, or a website contains the search text. */
function matchesSearch(cipher: CipherViewLike, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) {
    return true;
  }
  const login = CipherViewLikeUtils.getLogin(cipher);
  return [cipher.name, login?.username, ...(login?.uris ?? []).map((u) => u.uri)].some((value) =>
    value?.toLowerCase().includes(text),
  );
}
