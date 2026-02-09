export function StatusBadge({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className={`badge ${tone ?? 'pending'}`}>
      <span className="badge-dot" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
