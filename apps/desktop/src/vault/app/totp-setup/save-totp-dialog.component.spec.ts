import { ComponentFixture, TestBed } from "@angular/core/testing";
import { mock } from "jest-mock-extended";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { LoginUriView } from "@bitwarden/common/vault/models/view/login-uri.view";
import { LoginView } from "@bitwarden/common/vault/models/view/login.view";
import { DIALOG_DATA, DialogRef } from "@bitwarden/components";

import {
  NEW_LOGIN,
  SaveTotpDialogComponent,
  SaveTotpDialogParams,
} from "./save-totp-dialog.component";

function login(id: string, name: string, username: string, uri?: string, totp?: string) {
  const cipher = new CipherView();
  cipher.id = id;
  cipher.name = name;
  cipher.type = CipherType.Login;
  cipher.login = Object.assign(new LoginView(), { username, totp });
  cipher.login.uris = uri ? [Object.assign(new LoginUriView(), { uri })] : [];
  return cipher;
}

describe("SaveTotpDialogComponent", () => {
  let fixture: ComponentFixture<SaveTotpDialogComponent>;
  let component: any;
  const dialogRef = mock<DialogRef<string>>();

  function create(params: SaveTotpDialogParams) {
    TestBed.configureTestingModule({
      imports: [SaveTotpDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: params },
        { provide: DialogRef, useValue: dialogRef },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    });
    fixture = TestBed.createComponent(SaveTotpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const logins = [
    login("g", "GitHub", "alice", "https://github.com"),
    login("m", "Mail", "bob@example.com"),
    login("t", "Bank", "carol", undefined, "otpauth://totp/old?secret=X"),
  ];

  it("defaults to a new login unless a login is suggested", () => {
    create({ link: { issuer: "GitHub", account: "alice" }, logins });
    expect(component.target.value).toBe(NEW_LOGIN);
  });

  it("filters by name, username, and website", () => {
    create({ link: {}, logins });

    component.search.setValue("GITHUB.COM");
    expect(component.visibleLogins().map((c: CipherView) => c.id)).toEqual(["g"]);

    component.search.setValue("bob@");
    expect(component.visibleLogins().map((c: CipherView) => c.id)).toEqual(["m"]);
  });

  it("keeps the chosen login listed while searching for something else", () => {
    create({ link: {}, logins, suggestedCipherId: "m" });

    component.search.setValue("github");
    expect(component.visibleLogins().map((c: CipherView) => c.id)).toEqual(["g", "m"]);
  });

  it("warns when the chosen login already has a code", () => {
    create({ link: {}, logins });
    expect(component.replacesKey()).toBe(false);

    component.target.setValue("t");
    expect(component.replacesKey()).toBe(true);
  });

  it("closes with the chosen login", async () => {
    create({ link: {}, logins });
    component.target.setValue("g");

    await component.submit();

    expect(dialogRef.close).toHaveBeenCalledWith("g");
  });
});
