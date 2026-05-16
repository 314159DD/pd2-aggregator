import { buildMarketUrl } from "@/lib/price/marketUrl";
import type { PriceEntry } from "@/lib/price/snapshot";

export function MarketLinkButton({ entry, name }: { entry: PriceEntry; name: string }) {
  return (
    <a
      href={buildMarketUrl(entry, name)}
      target="_blank"
      rel="noopener noreferrer"
      title="View on pd2 market"
      className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-[#2a1e10] transition-colors"
      aria-label={`View ${name} on the pd2 market`}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
        <path d="M6 1.5h4.793L1.146 11.146l.708.708L11.5 2.207V7h1V1.5zM2.5 13.5V6.793L1.5 7.793V14.5h6.707l1-1H2.5z" />
      </svg>
    </a>
  );
}
