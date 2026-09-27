import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the consent screen's two buttons land.
 *
 * Approving mints an authorization code, so the session is checked again
 * here: a page that rendered is not evidence about who is submitting.
 * Supabase's client would redirect the browser itself, which only a browser
 * can do, so this asks for the URL and redirects from the server.
 */
export async function POST(request: NextRequest) {
  const origin = publicOrigin(request);
  const back = (authorizationId: string, message: string) =>
    NextResponse.redirect(
      `${origin}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&error=${encodeURIComponent(message)}`,
      303,
    );

  // The session cookies are SameSite=Lax, so a cross-site POST arrives without
  // one and fails below anyway. This refuses it earlier and more plainly.
  const sent = request.headers.get("origin");
  if (sent && sent !== origin) {
    return NextResponse.json({ error: "cross-origin request refused" }, { status: 403 });
  }

  const form = await request.formData();
  const authorizationId = String(form.get("authorization_id") ?? "").trim();
  const decision = String(form.get("decision") ?? "");
  if (!authorizationId) {
    return NextResponse.json({ error: "missing authorization_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 403 });
  }

  const answer =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        });

  if (answer.error || !answer.data) {
    return back(authorizationId, answer.error?.message ?? `${decision} failed`);
  }
  return NextResponse.redirect(answer.data.redirect_url, 303);
}
