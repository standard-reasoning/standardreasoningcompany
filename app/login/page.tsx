"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { verifyUrl } from "@/lib/auth/brand";
import { Sheet } from "../sheet";

/**
 * Identifier-first. The address is resolved before anything is asked for,
 * so nobody has to decide between signing in and signing up: a known
 * address with a password is asked for it, a known address without one is
 * emailed a link, and an unknown address goes to onboarding.
 */
type Stage = "identify" | "password" | "linkSent" | "resetSent";

function readable(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "That password does not match.";
  }
  if (/signups not allowed/i.test(message)) {
    return "No account for that address.";
  }
  return message;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<Stage>("identify");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  // Where to land after signing in. Same-origin paths only, the same guard
  // /auth/verify applies, so the consent screen can send a person here and
  // get them back.
  const rawNext = searchParams.get("next") ?? "/account";
  const after =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";

  function linkTo(next = after) {
    return verifyUrl(window.location.origin, next);
  }

  async function sendLink(address: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: false, emailRedirectTo: linkTo() },
    });
    if (error) throw new Error(readable(error.message));
  }

  /** Resolve the address, then route to whatever it needs. */
  async function identify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("account_lookup", {
      p_email: email,
    });

    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.account_exists) {
      // Unknown address. Onboarding, carrying the address across.
      router.push(`/subscribe?email=${encodeURIComponent(email)}`);
      return;
    }

    if (row.has_password) {
      setBusy(false);
      setStage("password");
      return;
    }

    try {
      await sendLink(email);
      setStage("linkSent");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);
    if (error) {
      setError(readable(error.message));
      return;
    }
    router.push(after);
    router.refresh();
  }

  async function emailLinkInstead() {
    setBusy(true);
    setError(null);
    try {
      await sendLink(email);
      setStage("linkSent");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: linkTo("/account?recovery=1"),
    });

    setBusy(false);
    if (error) setError(readable(error.message));
    else setStage("resetSent");
  }

  function restart() {
    setStage("identify");
    setPassword("");
    setError(null);
  }

  const heading: Record<Stage, string> = {
    identify: "Address",
    password: "Password",
    linkSent: "Link Sent",
    resetSent: "Reset Sent",
  };

  return (
    <Sheet action={<a href="/">Index</a>}>
      <header className="masthead masthead-sm">
        <h1 className="wordmark">Sign In</h1>
        <dl className="plate">
          <div className="plate-row">
            <dt>Address</dt>
            <dd className="plate-value">{email || "Pending"}</dd>
          </div>
          <div className="plate-row">
            <dt>Method</dt>
            <dd>
              {stage === "password"
                ? "Password"
                : stage === "identify"
                  ? "Pending"
                  : "Emailed Link"}
            </dd>
          </div>
        </dl>
      </header>

      <div className="section-head">
        <span className="title">{heading[stage]}</span>
        <span className="count">{busy ? "Working" : "Ready"}</span>
      </div>

      <main className="auth-body">
        {/* key drives the enter transition on every stage change */}
        <div className="stage" key={stage}>
          {stage === "identify" ? (
            <form onSubmit={identify}>
              <label className="auth-label" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                className="auth-input"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="auth-button" type="submit" disabled={busy}>
                {busy ? "Checking" : "Continue"}
              </button>
            </form>
          ) : null}

          {stage === "password" ? (
            <form onSubmit={signIn}>
              <label className="auth-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="auth-input"
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button className="auth-button" type="submit" disabled={busy}>
                {busy ? "Verifying" : "Sign In"}
              </button>

              <div className="auth-alts">
                <button
                  className="auth-back"
                  type="button"
                  onClick={forgotPassword}
                  disabled={busy}
                >
                  Forgot password
                </button>
                <button
                  className="auth-back"
                  type="button"
                  onClick={emailLinkInstead}
                  disabled={busy}
                >
                  Email a link instead
                </button>
                <button className="auth-back" type="button" onClick={restart}>
                  Use another address
                </button>
              </div>
            </form>
          ) : null}

          {stage === "linkSent" ? (
            <>
              <p className="auth-note">
                A sign-in link is on its way to {email}. It works on this device
                or any other.
              </p>
              <button className="auth-back" type="button" onClick={restart}>
                Use another address
              </button>
            </>
          ) : null}

          {stage === "resetSent" ? (
            <>
              <p className="auth-note">
                A reset link is on its way to {email}. Opening it signs the
                account in so a new password can be set.
              </p>
              <button className="auth-back" type="button" onClick={restart}>
                Back
              </button>
            </>
          ) : null}

          {error ? <p className="auth-error">{error}</p> : null}
        </div>
      </main>

      <div className="fill" />
    </Sheet>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
