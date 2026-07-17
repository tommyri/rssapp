import { AccountStatusControl } from "@/components/account-status-control";
import { BackLink } from "@/components/back-link";
import { OwnershipTransferControl } from "@/components/ownership-transfer-control";
import { listManagedAccounts } from "@/lib/admin-accounts";
import { getCurrentOwner } from "@/lib/current-user";
import { canReceiveOwnership } from "@/lib/owner-transfer";

function dateLabel(value: Date | null) {
  return value ? value.toLocaleDateString("en-GB") : "Never";
}

export default async function AccountManagementPage() {
  await getCurrentOwner();
  const accounts = await listManagedAccounts();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Owner console</p>
          <h1 className="font-serif text-2xl font-bold tracking-tight">
            Accounts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Review reader accounts and suspend access when support or security
            requires it. Suspension signs the account out immediately.
          </p>
        </div>
        <BackLink />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Access</th>
              <th className="px-4 py-3 text-right font-medium">Feeds</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const owner = account.role === "owner";
              return (
                <tr key={account.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {account.displayName || account.email}
                    </p>
                    {account.displayName ? (
                      <p className="text-xs text-muted-foreground">
                        {account.email}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] uppercase ${
                          account.status === "active"
                            ? "border-border/70 text-muted-foreground"
                            : "border-destructive/40 bg-destructive/10 text-destructive"
                        }`}
                      >
                        {account.status}
                      </span>
                      {owner ? (
                        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-primary uppercase">
                          Owner
                        </span>
                      ) : null}
                      {!account.emailVerifiedAt ? (
                        <span className="text-xs text-muted-foreground">
                          Unverified
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {account.subscriptionCount}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dateLabel(account.lastSignedInAt)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dateLabel(account.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {owner ? (
                      <p className="text-right text-xs text-muted-foreground">
                        Owner account
                      </p>
                    ) : (
                      <div className="flex flex-col items-end gap-3">
                        <AccountStatusControl
                          accountId={account.id}
                          status={account.status}
                        />
                        {canReceiveOwnership(account) ? (
                          <OwnershipTransferControl
                            accountId={account.id}
                            email={account.email}
                          />
                        ) : (
                          <p className="max-w-48 text-right text-xs text-muted-foreground">
                            Ownership requires an active, verified account.
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
