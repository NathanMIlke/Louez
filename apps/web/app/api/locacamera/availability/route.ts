import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getProductAvailability, pgDb, stores } from "@louez/db/postgres";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  storeSlug: z.string().min(1).max(100).optional().default("locacamera"),
});

type StoreSettings = {
  pendingBlocksAvailability?: boolean;
  turnoverBufferMinutes?: number;
};

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { productIds, startDate, endDate, storeSlug } = parsed.data;

  if (endDate <= startDate) {
    return NextResponse.json({ error: "invalid_period" }, { status: 400 });
  }

  const [store] = await pgDb
    .select({ id: stores.id, settings: stores.settings })
    .from(stores)
    .where(eq(stores.slug, storeSlug))
    .limit(1);

  if (!store) {
    return NextResponse.json({ error: "store_not_found" }, { status: 404 });
  }

  const settings = (store.settings ?? {}) as StoreSettings;
  const availability = await getProductAvailability({
    storeId: store.id,
    productIds,
    start: startDate,
    end: endDate,
    pendingBlocksAvailability: settings.pendingBlocksAvailability,
    turnoverBufferMinutes: settings.turnoverBufferMinutes,
  });

  return NextResponse.json(
    {
      store: storeSlug,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      products: availability,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
