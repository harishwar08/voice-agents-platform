export function SignOutButton() {
  return (
    <form action="/auth/logout" method="post">
      <button
        type="submit"
        className="text-sm font-medium text-muted transition hover:text-foreground"
      >
        Sign out
      </button>
    </form>
  );
}
