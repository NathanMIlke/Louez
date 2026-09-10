import {
  db,
  customers,
  reservations,
  locacameraCustomerProfiles,
} from '@louez/db';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { dashboardProcedure } from '../../procedures';

const customerDateFilterSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listInputSchema = z.object({
  search: z.string().optional(),
  sort: z.enum(['recent', 'name', 'reservations', 'spent']).optional(),
  type: z.enum(['all', 'individual', 'business']).optional(),
  createdFrom: customerDateFilterSchema.optional(),
  createdTo: customerDateFilterSchema.optional(),
});

const list = dashboardProcedure
  .input(listInputSchema)
  .handler(async ({ context, input }) => {
    const storeId = context.store.id;
    const conditions = [eq(customers.storeId, storeId)];

    const search = input.search?.trim();
    if (search) {
      const searchLower = `%${search.toLowerCase()}%`;
      conditions.push(sql`(
        LOWER(${customers.firstName}) LIKE ${searchLower} OR
        LOWER(${customers.lastName}) LIKE ${searchLower} OR
        LOWER(${customers.email}) LIKE ${searchLower} OR
        LOWER(${customers.phone}) LIKE ${searchLower} OR
        LOWER(${customers.companyName}) LIKE ${searchLower} OR
        LOWER(${locacameraCustomerProfiles.cpfCnpj}) LIKE ${searchLower}
      )`);
    }

    if (input.type === 'individual' || input.type === 'business') {
      conditions.push(eq(customers.customerType, input.type));
    }

    if (input.createdFrom) {
      conditions.push(
        sql`${customers.createdAt} >= ${`${input.createdFrom} 00:00:00`}`,
      );
    }

    if (input.createdTo) {
      conditions.push(
        sql`${customers.createdAt} < DATE_ADD(${`${input.createdTo} 00:00:00`}, INTERVAL 1 DAY)`,
      );
    }

    const whereClause = and(...conditions)!;

    let query = db
      .select({
        id: customers.id,
        customerType: customers.customerType,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
        companyName: customers.companyName,
        cpfCnpj: locacameraCustomerProfiles.cpfCnpj,
        phone: customers.phone,
        city: customers.city,
        createdAt: customers.createdAt,
        reservationCount: count(reservations.id),
        totalSpent: sql<string>`COALESCE(SUM(${reservations.totalAmount}), 0)`,
        lastReservation: sql<Date | null>`MAX(${reservations.createdAt})`,
      })
      .from(customers)
      .leftJoin(
        locacameraCustomerProfiles,
        and(
          eq(locacameraCustomerProfiles.customerId, customers.id),
          eq(locacameraCustomerProfiles.storeId, storeId),
        ),
      )
      .leftJoin(
        reservations,
        and(
          eq(reservations.customerId, customers.id),
          eq(reservations.storeId, storeId),
        ),
      )
      .where(whereClause)
      .groupBy(customers.id, locacameraCustomerProfiles.cpfCnpj)
      .$dynamic();

    switch (input.sort) {
      case 'name':
        query = query.orderBy(customers.lastName, customers.firstName);
        break;
      case 'reservations':
        query = query.orderBy(desc(count(reservations.id)));
        break;
      case 'spent':
        query = query.orderBy(
          desc(sql`COALESCE(SUM(${reservations.totalAmount}), 0)`),
        );
        break;
      default:
        query = query.orderBy(desc(customers.createdAt));
    }

    const [customerRows, totalCountResult] = await Promise.all([
      query,
      db
        .select({ count: count() })
        .from(customers)
        .where(eq(customers.storeId, storeId)),
    ]);

    return {
      customers: customerRows,
      totalCount: totalCountResult[0]?.count ?? 0,
    };
  });

export const dashboardCustomersRouter = {
  list,
};
