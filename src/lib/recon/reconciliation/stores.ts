import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AccountIdentifier } from "../types";
import type { PaymentApplication } from "./types";

export type ReconciliationStore = {
  listApplications(): PaymentApplication[];
};

export type PaymentApplicationStore = ReconciliationStore & {
  isBankTransactionConsumed(bankTransactionId: string): boolean;
  isProofConsumed(proofId: string | undefined): boolean;
  saveApplication(application: PaymentApplication): boolean;
};

export type CounterpartyIdentity = {
  canonicalName: string;
  aliases: string[];
  payerNames: string[];
  debtorAccounts: AccountIdentifier[];
  notes?: string;
};

export type CounterpartyIdentityStore = {
  findByName(name: string | null): CounterpartyIdentity | null;
  findByAccount(account: AccountIdentifier | null | undefined): CounterpartyIdentity | null;
  namesMatch(a: string | null, b: string | null): boolean;
  accountsMatch(a: AccountIdentifier | null | undefined, b: AccountIdentifier | null | undefined): boolean;
};

export class InMemoryPaymentApplicationStore implements PaymentApplicationStore {
  private readonly applications = new Map<string, PaymentApplication>();

  listApplications(): PaymentApplication[] {
    return [...this.applications.values()];
  }

  isBankTransactionConsumed(bankTransactionId: string): boolean {
    return this.listApplications().some((app) => app.bankTransactionId === bankTransactionId);
  }

  isProofConsumed(proofId: string | undefined): boolean {
    return proofId ? this.listApplications().some((app) => app.proofId === proofId) : false;
  }

  saveApplication(application: PaymentApplication): boolean {
    if (this.isBankTransactionConsumed(application.bankTransactionId) || this.isProofConsumed(application.proofId)) {
      return false;
    }
    this.applications.set(application.applicationId, application);
    return true;
  }
}

export class LocalJsonPaymentApplicationStore implements PaymentApplicationStore {
  constructor(private readonly dir: string) {}

  listApplications(): PaymentApplication[] {
    if (!existsSync(this.dir)) return [];
    try {
      const index = JSON.parse(readFileSync(this.indexPath(), "utf8")) as PaymentApplication[];
      return Array.isArray(index) ? index : [];
    } catch {
      return [];
    }
  }

  isBankTransactionConsumed(bankTransactionId: string): boolean {
    return this.listApplications().some((app) => app.bankTransactionId === bankTransactionId);
  }

  isProofConsumed(proofId: string | undefined): boolean {
    return proofId ? this.listApplications().some((app) => app.proofId === proofId) : false;
  }

  saveApplication(application: PaymentApplication): boolean {
    if (this.isBankTransactionConsumed(application.bankTransactionId) || this.isProofConsumed(application.proofId)) {
      return false;
    }
    const applications = [...this.listApplications(), application];
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.indexPath(), `${JSON.stringify(applications, null, 2)}\n`, "utf8");
    writeFileSync(join(this.dir, `${application.applicationId}.json`), `${JSON.stringify(application, null, 2)}\n`, "utf8");
    return true;
  }

  private indexPath(): string {
    return join(this.dir, "applications.json");
  }
}

export class LocalCounterpartyIdentityStore implements CounterpartyIdentityStore {
  constructor(private readonly identities: CounterpartyIdentity[] = []) {}

  findByName(name: string | null): CounterpartyIdentity | null {
    if (!name) return null;
    return this.identities.find((identity) => this.nameInIdentity(identity, name)) ?? null;
  }

  findByAccount(account: AccountIdentifier | null | undefined): CounterpartyIdentity | null {
    if (!account) return null;
    return this.identities.find((identity) => identity.debtorAccounts.some((known) => accountsEqual(known, account))) ?? null;
  }

  namesMatch(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    const left = this.findByName(a);
    const right = this.findByName(b);
    return left !== null && right !== null && left.canonicalName === right.canonicalName;
  }

  accountsMatch(a: AccountIdentifier | null | undefined, b: AccountIdentifier | null | undefined): boolean {
    if (a && b && accountsEqual(a, b)) return true;
    const left = this.findByAccount(a);
    const right = this.findByAccount(b);
    return left !== null && right !== null && left.canonicalName === right.canonicalName;
  }

  private nameInIdentity(identity: CounterpartyIdentity, name: string): boolean {
    const values = [identity.canonicalName, ...identity.aliases, ...identity.payerNames].map((value) => value.toUpperCase());
    return values.includes(name.toUpperCase());
  }
}

export class LocalJsonCounterpartyIdentityStore extends LocalCounterpartyIdentityStore {
  constructor(path: string) {
    super(readIdentities(path));
  }
}

function accountValues(account: AccountIdentifier): string[] {
  return [account.iban, account.swiftBic, account.localAccountId, account.maskedAccount]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toUpperCase());
}

function accountsEqual(a: AccountIdentifier, b: AccountIdentifier): boolean {
  const left = new Set(accountValues(a));
  return accountValues(b).some((value) => left.has(value));
}

function readIdentities(path: string): CounterpartyIdentity[] {
  if (!existsSync(path)) return [];
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as CounterpartyIdentity[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
