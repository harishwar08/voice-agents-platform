/** Marks a field the form cannot be sent without; the error under it says what is missing. */
export function RequiredMark() {
  return (
    <span className="text-warn" aria-hidden="true" title="Required">
      *
    </span>
  );
}

/** Marks a field that can be left empty, so it isn't mistaken for a required one. */
export function OptionalMark() {
  return <span className="font-normal text-muted">(optional)</span>;
}
