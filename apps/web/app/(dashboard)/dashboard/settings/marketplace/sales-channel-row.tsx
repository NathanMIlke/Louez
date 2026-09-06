import type { ReactNode } from "react";

import { cn } from "@louez/utils";

interface SalesChannelRowProps {
  /** Logo or icon tile, already sized (`size-9`). */
  icon: ReactNode;
  /** Channel name, optionally already branded (wordmark). */
  name: ReactNode;
  badge?: ReactNode;
  description: string;
  /** Right-hand control: a switch, or the channel's actions. */
  aside?: ReactNode;
  /** Optional details revealed under the description (status, offer, …). */
  children?: ReactNode;
  className?: string;
}

/**
 * One line of the sales-channel list. Every channel (reeent, the storefront,
 * the ones to come) shares this shape so the list reads as a single column of
 * comparable rows rather than a grid of unrelated cards.
 */
export const SalesChannelRow = ({
  icon,
  name,
  badge,
  description,
  aside,
  children,
  className,
}: SalesChannelRowProps) => (
  <li className={cn("bg-card min-w-0 rounded-xl border p-4 transition-colors sm:p-5", className)}>
    <div className="flex items-start gap-3 sm:gap-4">
      {icon}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-base font-semibold tracking-tight">{name}</h4>
          {badge}
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
    {children && <div className="mt-4 space-y-3 sm:ps-13">{children}</div>}
  </li>
);
