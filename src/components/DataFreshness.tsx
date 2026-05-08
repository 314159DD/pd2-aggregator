import type { LoadSource } from "@/lib/data-loader";

export function DataFreshness({ source, fetchedAt }: { source: LoadSource; fetchedAt: number }) {
  const ageMs = Date.now() - fetchedAt;
  const ageMin = Math.floor(ageMs / 60000);
  const ageH = Math.floor(ageMin / 60);
  const human = ageH > 0 ? `${ageH}h ago` : `${ageMin}m ago`;
  return (
    <div className="text-xs text-muted-foreground">
      Data: {source} · fetched {human}
    </div>
  );
}
