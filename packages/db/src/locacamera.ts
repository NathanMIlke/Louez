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

import { customers, stores } from './schema'

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
