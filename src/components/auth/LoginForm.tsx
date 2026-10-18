"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { redirectPathForRole, safeReturnPath } from "@/lib/auth/roles";
import type { PlatformRole } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

import { PasswordInput } from "./PasswordInput";

const demoAccount = {
  label: "Business owner",
  email: "ravi@srimobile.in",
  password: "OwnerPass123",
};

/** The demo login is for local development; the live site must not advertise working credentials. */
const showDemo = process.env.NODE_ENV !== "production";

function nextParam(): string | null {
  return new URLSearchParams(window.location.search).get("next");
}

export function LoginForm({ initialError = null }: { initialError?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [redirecting, setRedirecting] = useState(false);
  const supabaseReady = isSupabaseConfigured();

  async function handleGoogle() {
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError("Could not connect to Supabase.");
      return;
    }
    setRedirecting(true);
    const callback = new URL("/auth/callback", window.location.origin);
    const next = nextParam();
    if (next) callback.searchParams.set("next", next);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (oauthError) {
      setRedirecting(false);
      setError(oauthError.message);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Enter an email and password to continue.");
      return;
    }

    if (!supabaseReady) {
      setError("Supabase is not configured. Copy .env.example to .env.local and add your project keys.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Could not connect to Supabase.");
      return;
    }

    setSubmitting(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setSubmitting(false);
      setError(signInError?.message ?? "Sign in failed. Check your credentials.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("platform_role")
      .eq("id", data.user.id)
      .maybeSingle();

    const platformRole = (profile as { platform_role: PlatformRole } | null)
      ?.platform_role;

    if (!platformRole) {
      setSubmitting(false);
      setError("Signed in, but no profile was found. Run the Phase 2 seed script.");
      return;
    }

    // No router.refresh() after this: pages aren't cached in the browser, so the push already
    // renders the next page with the new session, and a refresh would render it a second time.
    router.push(safeReturnPath(nextParam(), platformRole) ?? redirectPathForRole(platformRole));
  }

  function fillDemo() {
    setEmail(demoAccount.email);
    setPassword(demoAccount.password);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={redirecting || submitting}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent disabled:opacity-60"
      >
        <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {redirecting ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@business.in"
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </label>

        <label className="block space-y-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-foreground">Password</span>
            <Link href="/forgot-password" className="text-xs font-medium text-accent hover:underline">
              Forgot password?
            </Link>
          </span>
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </label>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Log in"}
        </button>
      </form>

      {showDemo ? (
        <div className="border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Demo account
          </p>
          <button
            type="button"
            onClick={fillDemo}
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-accent"
          >
            <span className="font-medium text-foreground">{demoAccount.label}</span>
            <span className="mt-0.5 block text-xs text-muted">{demoAccount.email}</span>
          </button>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Run <code className="rounded bg-background px-1 py-0.5">npm run db:seed</code> after
            applying migrations to create this user.
          </p>
        </div>
      ) : null}
    </div>
  );
}
