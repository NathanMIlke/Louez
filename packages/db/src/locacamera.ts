import {
  boolean,
  date,
  decimal,
  index,
  json,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core'
import { nanoid } from 'nanoid'

import { customers, payments, stores } from './schema'

/**
 * LocaCamera-specific customer data.
 *
 * Kept outside the upstream Louez customer schema so LocaCamera can evolve its
 * operational fields without coupling every customization to upstream changes.
 */
export const locacameraCustomerProfiles = mysqlTable(
  'locacamera_customer_profiles',
  {
    customerId: varchar('customer_id', { length: 21 })
      .primaryKey()
      .references(() => customers.id, { onDelete: 'cascade' }),
    storeId: varchar('store_id', { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),

    // Traceability back to the legacy EstoqueNow record.
    estoqueNowClientId: varchar('estoquenow_client_id', { length: 64 }),

    // Brazilian identity and tax data from EstoqueNow.
    cpfCnpj: varchar('cpf_cnpj', { length: 32 }),
    rgNumber: varchar('rg_number', { length: 64 }),
    rgIssueAgency: varchar('rg_issue_agency', { length: 64 }),
    socialName: varchar('social_name', { length: 255 }),
    stateRegistration: varchar('state_registration', { length: 64 }),
    municipalRegistration: varchar('municipal_registration', { length: 64 }),
    birthday: date('birthday', { mode: 'date' }),
    gender: varchar('gender', { length: 32 }),
    genderName: varchar('gender_name', { length: 64 }),
    isForeigner: boolean('is_foreigner'),

    // Contact details that do not fit the single native Louez phone field.
    phoneCountryCode: varchar('phone_country_code', { length: 8 }),
    phone2: varchar('phone2', { length: 50 }),
    phone2CountryCode: varchar('phone2_country_code', { length: 8 }),
    phoneType: varchar('phone_type', { length: 32 }),
    phone2Type: varchar('phone2_type', { length: 32 }),

    // Brazilian address details preserved separately from Louez's compact address.
    addressType: varchar('address_type', { length: 32 }),
    neighborhood: varchar('address_neighborhood', { length: 255 }),
    state: varchar('address_state', { length: 64 }),
    addressNumber: varchar('address_number', { length: 64 }),
    addressComplement: varchar('address_complement', { length: 255 }),

    // Legacy customer state/profile used by LocaCamera operations.
    statusId: varchar('status_id', { length: 64 }),
    statusName: varchar('status_name', { length: 128 }),
    isEnabled: boolean('is_enabled'),
    isBlocked: boolean('is_blocked'),
    standardDiscount: decimal('standard_discount', { precision: 10, scale: 4 }),
    customerProfile: varchar('customer_profile', { length: 255 }),
    customerProfileName: varchar('customer_profile_name', { length: 255 }),
    userContact: varchar('user_contact', { length: 255 }),
    trafficSourceId: varchar('traffic_source_id', { length: 64 }),
    typeName: varchar('type_name', { length: 64 }),

    instagram: varchar('instagram', { length: 255 }),
    acquisitionSource: varchar('acquisition_source', { length: 255 }),
    registeredAt: timestamp('registered_at', { mode: 'date' }),
    backupContact: varchar('backup_contact', { length: 255 }),

    // Pinned links/references, one per line. This intentionally accepts both
    // URLs and private legacy references so the EstoqueNow/Wix migration can
    // preserve document pointers before binary files are copied to Louez storage.
    pinnedFiles: text('pinned_files'),

    // Immutable migration safety net: preserves the complete original record so
    // fields not yet promoted to first-class columns are never lost.
    legacyData: json('legacy_data').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('locacamera_customer_profiles_store_idx').on(table.storeId),
    storeCpfCnpjIdx: index('locacamera_customer_profiles_store_cpf_cnpj_idx').on(
      table.storeId,
      table.cpfCnpj,
    ),
    storeEstoqueNowUnique: unique('locacamera_customer_profiles_store_estoquenow_unique').on(
      table.storeId,
      table.estoqueNowClientId,
    ),
  }),
)

/**
 * Canonical payment-method catalog for LocaCamera.
 *
 * `payments.method` remains the coarse Louez enum (cash/card/transfer/...) for
 * upstream compatibility. This table preserves the exact business-facing form,
 * such as "PIX Sicoob" or "Crédito Sipag", and its EstoqueNow identity.
 */
export const locacameraPaymentMethods = mysqlTable(
  'locacamera_payment_methods',
  {
    id: varchar('id', { length: 21 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    storeId: varchar('store_id', { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    sourceSystem: varchar('source_system', { length: 32 }).notNull().default('estoquenow'),
    externalId: varchar('external_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 64 }),
    application: varchar('application', { length: 128 }),
    canEdit: boolean('can_edit'),
    paymentServiceId: varchar('payment_service_id', { length: 64 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('locacamera_payment_methods_store_idx').on(table.storeId),
    storeSourceExternalUnique: unique('locacamera_payment_methods_store_source_external_unique').on(
      table.storeId,
      table.sourceSystem,
      table.externalId,
    ),
  }),
)

/**
 * One-to-one migration/audit extension for a native Louez payment.
 *
 * Historical payments keep both a link to the current payment-method catalog and
 * an immutable name snapshot. Renaming a method later therefore never rewrites
 * the historical method shown on an old order.
 */
export const locacameraPaymentMetadata = mysqlTable(
  'locacamera_payment_metadata',
  {
    paymentId: varchar('payment_id', { length: 21 })
      .primaryKey()
      .references(() => payments.id, { onDelete: 'cascade' }),
    storeId: varchar('store_id', { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    paymentMethodId: varchar('payment_method_id', { length: 21 }).references(
      () => locacameraPaymentMethods.id,
      { onDelete: 'set null' },
    ),
    paymentMethodNameSnapshot: varchar('payment_method_name_snapshot', { length: 255 }),
    sourceSystem: varchar('source_system', { length: 32 }).notNull().default('estoquenow'),
    externalPaymentId: varchar('external_payment_id', { length: 64 }),
    externalOrderId: varchar('external_order_id', { length: 64 }),
    legacyData: json('legacy_data').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('locacamera_payment_metadata_store_idx').on(table.storeId),
    paymentMethodIdx: index('locacamera_payment_metadata_method_idx').on(table.paymentMethodId),
    externalOrderIdx: index('locacamera_payment_metadata_external_order_idx').on(
      table.sourceSystem,
      table.externalOrderId,
    ),
    sourcePaymentUnique: unique('locacamera_payment_metadata_source_payment_unique').on(
      table.sourceSystem,
      table.externalPaymentId,
    ),
  }),
)
