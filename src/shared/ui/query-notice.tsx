export function QueryNotice({ loading, error, retry, label }: {
  loading?: boolean; error?: string | null; retry: () => unknown; label: string;
}) {
  if (error) return <div role="alert" className="mx-auto my-4 max-w-xl rounded border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800">
    <p>Could not load {label}: {error}</p>
    <button className="mt-2 underline" onClick={() => { void retry(); }}>Retry {label}</button>
  </div>;
  if (loading) return <p role="status" className="p-8 text-center text-sm text-stone-500">Loading {label}…</p>;
  return null;
}
