import { index, mysqlTable, text, timestamp, unique, varchar } from 'drizzle-orm/mysql-core'

/**
 * LocaCamera-specific customer data.
 *
 * Kept outside the upstream Louez customer schema so LocaCamera can evolve its
 * operational fields without coupling every customization to upstream changes.
 */
export const locacameraCustomerProfiles = mysqlTable(
  'locacamera_customer_profiles',
  {
    customerId: varchar('customer_id', { length: 21 }).primaryKey(),
    storeId: varchar('store_id', { length: 21 }).notNull(),

    // Traceability back to the legacy EstoqueNow record.
    estoqueNowClientId: varchar('estoquenow_client_id', { length: 64 }),

    instagram: varchar('instagram', { length: 255 }),
    acquisitionSource: varchar('acquisition_source', { length: 255 }),
    registeredAt: timestamp('registered_at', { mode: 'date' }),

    // One pinned file link/reference per line. This intentionally accepts both
    // URLs and private legacy references so the EstoqueNow/Wix migration can
    // preserve document pointers before binary files are copied to Louez storage.
    pinnedFiles: text('pinned_files'),

    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('locacamera_customer_profiles_store_idx').on(table.storeId),
    storeEstoqueNowUnique: unique('locacamera_customer_profiles_store_estoquenow_unique').on(
      table.storeId,
      table.estoqueNowClientId,
    ),
  }),
)
