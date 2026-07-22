import { AccountAccessControls } from "@/components/account-access-controls";
import { AccountInviteRevokeControl } from "@/components/account-invite-revoke-control";
import { AccountStatusControl } from "@/components/account-status-control";
import { BackLink } from "@/components/back-link";
import { OwnershipTransferControl } from "@/components/ownership-transfer-control";
import {
  accountAuditEventDescription,
  listAccountAuditEvents,
} from "@/lib/account-audit";
import {
  getRegistrationMode,
  listPendingAccountInvites,
} from "@/lib/account-invitations";
import { listManagedAccounts } from "@/lib/admin-accounts";
import { getCurrentOwner } from "@/lib/current-user";
import { canReceiveOwnership } from "@/lib/owner-transfer";

function dateLabel(value: Date | null) {
  return value ? value.toLocaleDateString("en-GB") : "Never";
}

function activityDate(value: Date) {
  return value.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AccountManagementPage() {
  await getCurrentOwner();
  const [accounts, registrationMode, invitations, auditEvents] =
    await Promise.all([
      listManagedAccounts(),
      getRegistrationMode(),
      listPendingAccountInvites(),
      listAccountAuditEvents(),
    ]);

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

      <section className="mb-6 rounded-lg border p-4">
        <div className="mb-4">
          <h2 className="font-serif text-lg font-semibold">Registration</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Choose how new people join this reader. Public signup remains the
            default; invitation-only is useful for a private beta.
          </p>
        </div>
        <AccountAccessControls registrationMode={registrationMode} />

        {invitations.length ? (
          <div className="mt-5 border-t pt-4">
            <h3 className="text-sm font-medium">Pending invitations</h3>
            <div className="mt-2 overflow-x-auto rounded-md border">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Expires</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{invitation.email}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {dateLabel(invitation.expiresAt)}
                      </td>
                      <td className="px-3 py-2">
                        <AccountInviteRevokeControl
                          invitationId={invitation.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mb-6 rounded-lg border p-4">
        <div className="mb-4">
          <h2 className="font-serif text-lg font-semibold">Recent activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Security and access changes from this owner console and operational
            recovery commands.
          </p>
        </div>
        {auditEvents.length ? (
          <ol className="divide-y rounded-md border">
            {auditEvents.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5"
              >
                <p className="text-sm">{accountAuditEventDescription(event)}</p>
                <p className="text-xs text-muted-foreground">
                  {event.actorEmail} · {activityDate(event.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No account administration changes have been recorded yet.
          </p>
        )}
      </section>

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
