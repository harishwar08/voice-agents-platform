"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { PasswordInput } from "./PasswordInput";

const MIN_PASSWORD_LENGTH = 8;
const input =
  "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent";

/**
 * Sets a new password for whoever the reset link signed in. Without that session (an
 * old link, or one opened in another browser) there is nobody to update, so it says so.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Could not connect to Supabase.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSaving(false);
      setError(
        /different from the old/i.test(updateError.message)
          ? "Choose a password different from your old one."
          : "Could not save the new password. Request a new reset link and try again."
      );
      return;
    }
    // Signed in already; staff are sent on from /dashboard to their console. The push renders
    // it fresh, so no router.refresh() (that would render it twice).
    router.push("/dashboard");
  }

  if (signedIn === null) return <p className="text-sm text-muted">Checking your reset link…</p>;

  if (!signedIn) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-foreground">
          This reset link has expired or was opened in a different browser from the one that asked for it.
        </p>
        <Link href="/forgot-password" className="inline-block font-semibold text-accent hover:underline">
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">New password</span>
        <PasswordInput
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={input}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Type it again</span>
        <PasswordInput
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={input}
        />
      </label>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
