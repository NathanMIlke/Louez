import { sql } from "drizzle-orm";

import { pgDb } from "./postgres";

export type ProductAvailabilityResult = {
  productId: string;
  available: boolean;
  availableQuantity: number;
  totalQuantity: number;
  trackUnits: boolean;
};

export async function getProductAvailability(params: {
  storeId: string;
  productIds: string[];
  start: Date;
  end: Date;
  pendingBlocksAvailability?: boolean;
  turnoverBufferMinutes?: number;
}): Promise<ProductAvailabilityResult[]> {
  const productIds = [...new Set(params.productIds.filter(Boolean))];
  if (productIds.length === 0) return [];
  if (params.end <= params.start) throw new Error("Invalid availability period");

  const blockingStatuses = params.pendingBlocksAvailability === false
    ? ["confirmed", "ongoing"]
    : ["pending", "confirmed", "ongoing"];

  const bufferMs = Math.max(0, params.turnoverBufferMinutes ?? 0) * 60_000;
  const bufferedStart = new Date(params.start.getTime() - bufferMs);
  const bufferedEnd = new Date(params.end.getTime() + bufferMs);

  const productRows = await pgDb.execute<{
    id: string;
    quantity: number;
    track_units: boolean;
  }>(sql`
    select id, quantity, track_units
    from public.products
    where store_id = ${params.storeId}
      and id in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
      and status = 'active'
  `);

  const quantityReservedRows = await pgDb.execute<{
    product_id: string;
    reserved_quantity: number;
  }>(sql`
    select ri.product_id, coalesce(sum(ri.quantity), 0)::int as reserved_quantity
    from public.reservation_items ri
    inner join public.reservations r on r.id = ri.reservation_id
    inner join public.products p on p.id = ri.product_id
    where r.store_id = ${params.storeId}
      and p.track_units = false
      and ri.product_id in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
      and r.status in (${sql.join(blockingStatuses.map((status) => sql`${status}`), sql`, `)})
      and r.start_date < ${bufferedEnd}
      and r.end_date > ${bufferedStart}
    group by ri.product_id
  `);

  const rentableUnitRows = await pgDb.execute<{
    product_id: string;
    rentable_quantity: number;
  }>(sql`
    select u.product_id, count(*)::int as rentable_quantity
    from public.product_units u
    inner join public.products p on p.id = u.product_id
    where p.store_id = ${params.storeId}
      and p.track_units = true
      and u.product_id in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
      and u.lifecycle_status = 'active'
      and not exists (
        select 1
        from public.product_unit_downtimes d
        where d.product_unit_id = u.id
          and d.starts_at < ${params.end}
          and (d.ends_at is null or d.ends_at > ${params.start})
      )
    group by u.product_id
  `);

  const busyUnitRows = await pgDb.execute<{
    product_id: string;
    busy_quantity: number;
  }>(sql`
    select u.product_id, count(distinct riu.product_unit_id)::int as busy_quantity
    from public.reservation_item_units riu
    inner join public.product_units u on u.id = riu.product_unit_id
    inner join public.reservation_items ri on ri.id = riu.reservation_item_id
    inner join public.reservations r on r.id = ri.reservation_id
    inner join public.products p on p.id = u.product_id
    where r.store_id = ${params.storeId}
      and p.track_units = true
      and u.product_id in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
      and u.lifecycle_status = 'active'
      and r.status in (${sql.join(blockingStatuses.map((status) => sql`${status}`), sql`, `)})
      and r.start_date < ${bufferedEnd}
      and r.end_date > ${bufferedStart}
      and not exists (
        select 1
        from public.product_unit_downtimes d
        where d.product_unit_id = u.id
          and d.starts_at < ${params.end}
          and (d.ends_at is null or d.ends_at > ${params.start})
      )
    group by u.product_id
  `);

  const quantityReserved = new Map(
    quantityReservedRows.map((row) => [row.product_id, Number(row.reserved_quantity)]),
  );
  const rentableUnits = new Map(
    rentableUnitRows.map((row) => [row.product_id, Number(row.rentable_quantity)]),
  );
  const busyUnits = new Map(
    busyUnitRows.map((row) => [row.product_id, Number(row.busy_quantity)]),
  );

  return productRows.map((product) => {
    const trackUnits = Boolean(product.track_units);
    const totalQuantity = trackUnits
      ? (rentableUnits.get(product.id) ?? 0)
      : Number(product.quantity);
    const reservedQuantity = trackUnits
      ? (busyUnits.get(product.id) ?? 0)
      : (quantityReserved.get(product.id) ?? 0);
    const availableQuantity = Math.max(0, totalQuantity - reservedQuantity);

    return {
      productId: product.id,
      available: availableQuantity > 0,
      availableQuantity,
      totalQuantity,
      trackUnits,
    };
  });
}
