import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Sheet } from "../../sheet";

export const dynamic = "force-dynamic";

/**
 * The consent screen for the shared project's OAuth server.
 *
 * Supabase Auth runs the authorization endpoint and sends the browser here
 * with an `authorization_id`. The dashboard's Authorization Path is joined to
 * the project's Site URL, which is this site, so every product on the shared
 * auth plane that wants an OAuth client consents on this one page. On
 * 09/26/2026 the path was pointed at austendewolf.com and reverted the same
 * day, because the setting takes a path and never a host.
 *
 * This page decides only that a signed-in person approved a named client.
 * Whether that person may use what the client reaches is the resource
 * server's call, made on every request: the Goodest's MCP route refuses any
 * token whose subject has no staff row. Deciding it here as well would put a
 * second copy of each product's access list on a site that knows none of them.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { authorization_id: authorizationId, error: failed } = await searchParams;

  if (!authorizationId) {
    return (
      <Frame state="Idle">
        <p className="auth-note">
          This page opens while an application is being connected, and it was
          reached without an authorization request.
        </p>
      </Frame>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !details) {
    return (
      <Frame state="Expired">
        <p className="auth-note">
          {error?.message ??
            "That authorization request is no longer valid. Start the connection again."}
        </p>
      </Frame>
    );
  }

  // Consent already on file for this client and these scopes: Supabase answers
  // with where to send the browser instead of anything to approve.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  const scopes = details.scope.split(" ").filter(Boolean);

  return (
    <Frame state="Waiting" client={details.client.name} account={user.email ?? ""}>
      <p className="auth-intro">
        {details.client.name} is asking to act as {user.email}. Approving hands
        it a credential that expires within the hour and renews itself until the
        grant is revoked.
      </p>

      <div className="record">
        <span className="key">Returns to</span>
        <span className="value">{details.redirect_uri}</span>
      </div>
      {scopes.length > 0 ? (
        <div className="record">
          <span className="key">Scopes</span>
          <span className="value">{scopes.join(" ")}</span>
        </div>
      ) : null}

      {failed ? <p className="auth-error">{failed}</p> : null}

      <form action="/api/oauth/decision" method="POST" className="auth-block">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button className="auth-button" type="submit" name="decision" value="approve">
          Approve
        </button>
        <div className="auth-alts">
          <button className="auth-back" type="submit" name="decision" value="deny">
            Deny
          </button>
        </div>
      </form>
    </Frame>
  );
}

function Frame({
  state,
  client,
  account,
  children,
}: {
  state: string;
  client?: string;
  account?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet action={<a href="/account">Account</a>}>
      <header className="masthead masthead-sm">
        <h1 className="wordmark">Authorize</h1>
        <dl className="plate">
          <div className="plate-row">
            <dt>Application</dt>
            <dd className="plate-value">{client ?? "Pending"}</dd>
          </div>
          <div className="plate-row">
            <dt>Account</dt>
            <dd className="plate-value">{account || "Pending"}</dd>
          </div>
        </dl>
      </header>

      <div className="section-head">
        <span className="title">Consent</span>
        <span className="count">{state}</span>
      </div>

      <main className="auth-body">{children}</main>

      <div className="fill" />
    </Sheet>
  );
}
