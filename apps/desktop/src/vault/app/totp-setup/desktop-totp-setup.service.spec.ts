import { TestBed } from "@angular/core/testing";
import { mock, MockProxy } from "jest-mock-extended";
import { BehaviorSubject, map, of } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherRepromptType, CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { LoginUriView } from "@bitwarden/common/vault/models/view/login-uri.view";
import { LoginView } from "@bitwarden/common/vault/models/view/login.view";
import { DialogService, ToastService } from "@bitwarden/components";
import { PasswordRepromptService } from "@bitwarden/vault";

import { DesktopSettingsService } from "../../../platform/services/desktop-settings.service";

import { DesktopTotpSetupService, matchScore, rankLogins } from "./desktop-totp-setup.service";
import { NEW_LOGIN, SaveTotpDialogComponent } from "./save-totp-dialog.component";

const LINK = "otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example";

function login(id: string, name: string, username: string, uri?: string, totp?: string) {
  const cipher = new CipherView();
  cipher.id = id;
  cipher.name = name;
  cipher.type = CipherType.Login;
  cipher.edit = true;
  cipher.login = Object.assign(new LoginView(), { username, totp });
  if (uri) {
    cipher.login.uris = [Object.assign(new LoginUriView(), { uri })];
  }
  return cipher;
}

describe("rankLogins", () => {
  it("puts issuer matches first, then account matches, then the rest by name", () => {
    const ranked = rankLogins(
      [
        login("b", "Bravo", "alice"),
        login("z", "Zulu", "bob"),
        login("x", "Other", "bob", "https://login.example.com"),
        login("e", "Example", "alice"),
        login("a", "Alpha", "bob"),
      ],
      { issuer: "Example", account: "alice" },
    );

    expect(ranked.map((c) => c.id)).toEqual(["e", "x", "b", "a", "z"]);
  });
});

describe("matchScore", () => {
  it("matches the issuer only as whole words of the name or website", () => {
    const link = { issuer: "a", account: "bob" };

    expect(matchScore(login("x", "Banana", "bob", "https://alpha.com"), link)).toBe(1);
    expect(matchScore(login("x", "Site A", "bob"), link)).toBe(3);
    expect(
      matchScore(login("x", "Mail", "", "https://login.example.com"), { issuer: "Example" }),
    ).toBe(2);
  });
});

describe("DesktopTotpSetupService", () => {
  let cipherService: MockProxy<CipherService>;
  let toastService: MockProxy<ToastService>;
  let status$: BehaviorSubject<AuthenticationStatus>;
  let passwordRepromptService: MockProxy<PasswordRepromptService>;
  let modalMode$: BehaviorSubject<{ isModalModeActive: boolean }>;
  let accountId$: BehaviorSubject<string>;
  let dialogResults: (string | undefined)[];
  let openDialog: jest.SpyInstance;
  let service: DesktopTotpSetupService;

  beforeEach(() => {
    (global as any).ipc = { platform: { focusWindow: jest.fn() } };
    cipherService = mock<CipherService>();
    toastService = mock<ToastService>();
    status$ = new BehaviorSubject<AuthenticationStatus>(AuthenticationStatus.Unlocked);
    passwordRepromptService = mock<PasswordRepromptService>();
    passwordRepromptService.passwordRepromptCheck.mockResolvedValue(true);
    modalMode$ = new BehaviorSubject({ isModalModeActive: false });
    const desktopSettingsService = mock<DesktopSettingsService>();
    desktopSettingsService.modalMode$ = modalMode$ as any;
    accountId$ = new BehaviorSubject("user-id");
    const accountService = mock<AccountService>();
    accountService.activeAccount$ = accountId$.pipe(map((id) => ({ id }) as any));
    const authService = mock<AuthService>();
    authService.activeAccountStatus$ = status$;
    const i18nService = mock<I18nService>();
    i18nService.t.mockImplementation((key) => key);

    dialogResults = [undefined];
    openDialog = jest
      .spyOn(SaveTotpDialogComponent, "open")
      .mockImplementation(() => ({ closed: of(dialogResults.shift()) }) as any);

    TestBed.configureTestingModule({
      providers: [
        { provide: AccountService, useValue: accountService },
        { provide: AuthService, useValue: authService },
        { provide: CipherService, useValue: cipherService },
        { provide: DesktopSettingsService, useValue: desktopSettingsService },
        { provide: PasswordRepromptService, useValue: passwordRepromptService },
        { provide: DialogService, useValue: {} },
        { provide: I18nService, useValue: i18nService },
        { provide: LogService, useValue: mock<LogService>() },
        { provide: ToastService, useValue: toastService },
      ],
    });
    service = TestBed.inject(DesktopTotpSetupService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).ipc;
  });

  it("saves the link to the chosen login", async () => {
    const existing = login("e", "Example", "alice");
    cipherService.getAllDecrypted.mockResolvedValue([existing]);
    dialogResults = ["e"];

    await service.saveFromLink(LINK);

    expect(openDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ suggestedCipherId: "e" }),
    );
    expect(cipherService.updateWithServer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e", login: expect.objectContaining({ totp: LINK }) }),
      "user-id",
    );
    expect(toastService.showToast).toHaveBeenCalled();
  });

  it("creates a new login named after the issuer", async () => {
    cipherService.getAllDecrypted.mockResolvedValue([]);
    dialogResults = [NEW_LOGIN];

    await service.saveFromLink(LINK);

    expect(cipherService.createWithServer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Example",
        type: CipherType.Login,
        login: expect.objectContaining({ username: "alice", totp: LINK }),
      }),
      "user-id",
    );
  });

  it("saves nothing when the user cancels", async () => {
    cipherService.getAllDecrypted.mockResolvedValue([login("e", "Example", "alice")]);

    await service.saveFromLink(LINK);

    expect(cipherService.updateWithServer).not.toHaveBeenCalled();
    expect(cipherService.createWithServer).not.toHaveBeenCalled();
  });

  it("does not preselect a login that matches the issuer but not the account", async () => {
    cipherService.getAllDecrypted.mockResolvedValue([login("t", "English Test", "dave")]);

    await service.saveFromLink(
      LINK.replace("Example", "Test").replace("issuer=Example", "issuer=Test"),
    );

    expect(openDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ suggestedCipherId: undefined }),
    );
  });

  it("only offers logins the user can edit, and suggests none when nothing matches the issuer", async () => {
    const readOnly = login("r", "Example", "alice");
    readOnly.edit = false;
    cipherService.getAllDecrypted.mockResolvedValue([readOnly, login("o", "Other", "alice")]);

    await service.saveFromLink(LINK);

    expect(openDialog).toHaveBeenCalledWith(expect.anything(), {
      link: { issuer: "Example", account: "alice" },
      logins: [expect.objectContaining({ id: "o" })],
      suggestedCipherId: undefined,
    });
  });

  it("waits for the vault to be unlocked before asking", async () => {
    status$.next(AuthenticationStatus.Locked);
    cipherService.getAllDecrypted.mockResolvedValue([]);

    const done = service.saveFromLink(LINK);
    await Promise.resolve();
    expect(openDialog).not.toHaveBeenCalled();

    status$.next(AuthenticationStatus.Unlocked);
    await done;
    expect(openDialog).toHaveBeenCalled();
  });

  it("does not preselect a login whose existing key would be replaced", async () => {
    cipherService.getAllDecrypted.mockResolvedValue([
      login("e", "Example", "alice", undefined, "OLD"),
    ]);

    await service.saveFromLink(LINK);

    expect(openDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ suggestedCipherId: undefined }),
    );
  });

  it("asks for the master password before changing a login that requires it", async () => {
    const protectedLogin = login("e", "Example", "alice");
    protectedLogin.reprompt = CipherRepromptType.Password;
    cipherService.getAllDecrypted.mockResolvedValue([protectedLogin]);
    dialogResults = ["e"];
    passwordRepromptService.passwordRepromptCheck.mockResolvedValue(false);

    await service.saveFromLink(LINK);

    expect(passwordRepromptService.passwordRepromptCheck).toHaveBeenCalledWith(protectedLogin);
    expect(cipherService.updateWithServer).not.toHaveBeenCalled();
  });

  it("shows an error when saving fails", async () => {
    cipherService.getAllDecrypted.mockResolvedValue([]);
    cipherService.createWithServer.mockRejectedValue(new Error("offline"));
    dialogResults = [NEW_LOGIN];

    await service.saveFromLink(LINK);

    expect(toastService.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "error" }),
    );
  });

  it("saves nothing if the account changed while asking", async () => {
    cipherService.getAllDecrypted.mockResolvedValue([]);
    openDialog.mockImplementation(() => {
      accountId$.next("other-user");
      return { closed: of(NEW_LOGIN) } as any;
    });

    await service.saveFromLink(LINK);

    expect(cipherService.createWithServer).not.toHaveBeenCalled();
  });

  it("ignores a second link while the first is still open", async () => {
    status$.next(AuthenticationStatus.Locked);
    cipherService.getAllDecrypted.mockResolvedValue([]);

    const first = service.saveFromLink(LINK);
    await service.saveFromLink(LINK);
    status$.next(AuthenticationStatus.Unlocked);
    await first;

    expect(openDialog).toHaveBeenCalledTimes(1);
  });

  it("asks again after an autofill request closed the dialog", async () => {
    cipherService.getAllDecrypted.mockResolvedValue([]);
    modalMode$.next({ isModalModeActive: true });
    dialogResults = [undefined, NEW_LOGIN];

    const done = service.saveFromLink(LINK);
    await new Promise((resolve) => setTimeout(resolve));
    expect(openDialog).toHaveBeenCalledTimes(1);

    modalMode$.next({ isModalModeActive: false });
    await done;

    expect(openDialog).toHaveBeenCalledTimes(2);
    // Leaving modal mode hid the window, so it is shown again for the dialog.
    expect((global as any).ipc.platform.focusWindow).toHaveBeenCalledTimes(2);
    expect(cipherService.createWithServer).toHaveBeenCalled();
  });

  it("ignores links it can't generate codes from", async () => {
    await service.saveFromLink("otpauth://hotp/Example:alice?secret=ABC&counter=1");

    expect(openDialog).not.toHaveBeenCalled();
    expect(cipherService.getAllDecrypted).not.toHaveBeenCalled();
  });
});
