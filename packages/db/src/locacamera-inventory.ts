import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core'
import { nanoid } from 'nanoid'

import { categories, products, productUnits, stores } from './schema'

/**
 * LocaCamera inventory migration layer.
 *
 * Native Louez `products`, `categories` and `product_units` remain the operational
 * source of truth. These extension tables preserve the exact EstoqueNow identity
 * and fields needed for historical orders, catalog rules and repeatable imports.
 *
 * Source visibility is deliberately separated from LocaCamera storefront
 * overrides: an internal/hidden item can still exist operationally and be linked
 * to historical reservations without becoming public.
 */
export const locacameraInventoryItems = mysqlTable(
  'locacamera_inventory_items',
  {
    productId: varchar('product_id', { length: 21 })
      .primaryKey()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: varchar('store_id', { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),

    sourceSystem: varchar('source_system', { length: 32 }).notNull().default('estoquenow'),
    externalProductId: varchar('external_product_id', { length: 64 }).notNull(),
    externalCompanyId: varchar('external_company_id', { length: 64 }),

    code: varchar('code', { length: 64 }),
    barcode: varchar('barcode', { length: 128 }),
    externalType: int('external_type'),
    managementType: varchar('management_type', { length: 32 }),

    sourceUnitPrice: decimal('source_unit_price', { precision: 12, scale: 2 }),
    promotionalUnitPrice: decimal('promotional_unit_price', { precision: 12, scale: 2 }),
    unitPriceForPj: decimal('unit_price_for_pj', { precision: 12, scale: 2 }),
    buyPrice: decimal('buy_price', { precision: 12, scale: 2 }),
    unitCostPrice: decimal('unit_cost_price', { precision: 12, scale: 2 }),
    repositionPrice: decimal('reposition_price', { precision: 12, scale: 2 }),
    failurePrice: decimal('failure_price', { precision: 12, scale: 2 }),

    sourceQuantity: int('source_quantity'),
    maintainingQuantity: int('maintaining_quantity'),
    unitType: varchar('unit_type', { length: 32 }),

    externalCategoryId: varchar('external_category_id', { length: 64 }),
    externalCategoryNameSnapshot: varchar('external_category_name_snapshot', { length: 255 }),
    providerId: varchar('provider_id', { length: 64 }),

    isEnabled: boolean('is_enabled'),
    isVisibleVirtualStore: boolean('is_visible_virtualstore'),
    isHighlighted: boolean('is_highlighted'),
    isArchived: boolean('is_archived'),
    isFavoriteItem: boolean('is_favorite_item'),
    hasInventoryManaged: boolean('has_inventory_managed'),

    // LocaCamera decisions. null = no local override; use imported/source policy.
    storefrontVisibleOverride: boolean('storefront_visible_override'),
    featuredOverride: boolean('featured_override'),

    keywords: text('keywords'),
    observations: text('observations'),
    uri: varchar('uri', { length: 255 }),

    sourceImageUrls: json('source_image_urls').$type<string[]>(),
    sourceVideoUrl: text('source_video_url'),

    dimensions: json('dimensions').$type<{
      width?: string | number | null
      height?: string | number | null
      length?: string | number | null
      weight?: string | number | null
      diameter?: string | number | null
      size?: string | number | null
      widthUnit?: string | null
      heightUnit?: string | null
      lengthUnit?: string | null
      weightUnit?: string | null
      diameterUnit?: string | null
    }>(),

    kitSettings: json('kit_settings').$type<{
      isPricePreset?: boolean | null
      unitPrice?: string | number | null
      isQuantityPreset?: boolean | null
    }>(),

    minutesBlockedBeforeDelivery: int('minutes_blocked_before_delivery'),
    minutesBlockedAfterReturn: int('minutes_blocked_after_return'),
    quantityTimesRented: int('quantity_times_rented'),

    sourceCreatedAt: timestamp('source_created_at', { mode: 'date' }),
    sourceUpdatedAt: timestamp('source_updated_at', { mode: 'date' }),
    syncedAt: timestamp('synced_at', { mode: 'date' }).defaultNow().notNull(),

    // Full raw record is retained so future mappings never require a lossy re-import.
    legacyData: json('legacy_data').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('lci_items_store_idx').on(table.storeId),
    categoryIdx: index('lci_items_category_idx').on(table.storeId, table.externalCategoryId),
    codeIdx: index('lci_items_code_idx').on(table.storeId, table.code),
    barcodeIdx: index('lci_items_barcode_idx').on(table.storeId, table.barcode),
    visibilityIdx: index('lci_items_visibility_idx').on(
      table.storeId,
      table.isVisibleVirtualStore,
      table.storefrontVisibleOverride,
    ),
    storeSourceExternalUnique: unique('lci_items_store_source_external_unique').on(
      table.storeId,
      table.sourceSystem,
      table.externalProductId,
    ),
  }),
)

export const locacameraInventoryCategories = mysqlTable(
  'locacamera_inventory_categories',
  {
    categoryId: varchar('category_id', { length: 21 })
      .primaryKey()
      .references(() => categories.id, { onDelete: 'cascade' }),
    storeId: varchar('store_id', { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),

    sourceSystem: varchar('source_system', { length: 32 }).notNull().default('estoquenow'),
    externalCategoryId: varchar('external_category_id', { length: 64 }).notNull(),
    externalCompanyId: varchar('external_company_id', { length: 64 }),

    prefix: varchar('prefix', { length: 64 }),
    uri: varchar('uri', { length: 255 }),
    sourceOrder: int('source_order'),
    isVisibleVirtualStore: boolean('is_visible_virtualstore'),
    sourceImageUrl: text('source_image_url'),

    legacyData: json('legacy_data').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('lci_categories_store_idx').on(table.storeId),
    storeSourceExternalUnique: unique('lci_categories_store_source_external_unique').on(
      table.storeId,
      table.sourceSystem,
      table.externalCategoryId,
    ),
  }),
)

export const locacameraInventoryTags = mysqlTable(
  'locacamera_inventory_tags',
  {
    id: varchar('id', { length: 21 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    storeId: varchar('store_id', { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),

    sourceSystem: varchar('source_system', { length: 32 }).notNull().default('estoquenow'),
    externalTagId: varchar('external_tag_id', { length: 64 }).notNull(),
    externalCompanyId: varchar('external_company_id', { length: 64 }),
    name: varchar('name', { length: 255 }).notNull(),
    isVisibleVirtualStore: boolean('is_visible_virtualstore'),

    legacyData: json('legacy_data').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('lci_tags_store_idx').on(table.storeId),
    nameIdx: index('lci_tags_name_idx').on(table.storeId, table.name),
    storeSourceExternalUnique: unique('lci_tags_store_source_external_unique').on(
      table.storeId,
      table.sourceSystem,
      table.externalTagId,
    ),
  }),
)

export const locacameraInventoryItemTags = mysqlTable(
  'locacamera_inventory_item_tags',
  {
    id: varchar('id', { length: 21 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    productId: varchar('product_id', { length: 21 })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    tagId: varchar('tag_id', { length: 21 })
      .notNull()
      .references(() => locacameraInventoryTags.id, { onDelete: 'cascade' }),

    sourceSystem: varchar('source_system', { length: 32 }).notNull().default('estoquenow'),
    externalProductId: varchar('external_product_id', { length: 64 }),
    externalTagId: varchar('external_tag_id', { length: 64 }),

    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    productIdx: index('lci_item_tags_product_idx').on(table.productId),
    tagIdx: index('lci_item_tags_tag_idx').on(table.tagId),
    productTagUnique: unique('lci_item_tags_product_tag_unique').on(table.productId, table.tagId),
  }),
)

/**
 * Kit composition from EstoqueNow. `componentProductId` may be null temporarily
 * while imports are being resolved, but the external component id is mandatory
 * so the relation can be repaired deterministically after all products exist.
 */
export const locacameraKitItems = mysqlTable(
  'locacamera_kit_items',
  {
    id: varchar('id', { length: 21 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    storeId: varchar('store_id', { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    kitProductId: varchar('kit_product_id', { length: 21 })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    componentProductId: varchar('component_product_id', { length: 21 }).references(
      () => products.id,
      { onDelete: 'set null' },
    ),

    sourceSystem: varchar('source_system', { length: 32 }).notNull().default('estoquenow'),
    externalKitProductId: varchar('external_kit_product_id', { length: 64 }).notNull(),
    externalComponentProductId: varchar('external_component_product_id', { length: 64 }).notNull(),

    quantity: decimal('quantity', { precision: 10, scale: 3 }).notNull().default('1'),
    unitPrice: decimal('unit_price', { precision: 12, scale: 2 }),
    legacyData: json('legacy_data').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    kitIdx: index('lci_kit_items_kit_idx').on(table.kitProductId),
    componentIdx: index('lci_kit_items_component_idx').on(table.componentProductId),
    sourceUnique: unique('lci_kit_items_source_unique').on(
      table.storeId,
      table.sourceSystem,
      table.externalKitProductId,
      table.externalComponentProductId,
    ),
  }),
)

/**
 * Future-proof link for individually tracked equipment. It can stay empty for
 * quantity-only products and be populated if/when the EstoqueNow source exposes
 * unit/serial-level records.
 */
export const locacameraInventoryUnitMetadata = mysqlTable(
  'locacamera_inventory_unit_metadata',
  {
    productUnitId: varchar('product_unit_id', { length: 21 })
      .primaryKey()
      .references(() => productUnits.id, { onDelete: 'cascade' }),
    storeId: varchar('store_id', { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),

    sourceSystem: varchar('source_system', { length: 32 }).notNull().default('estoquenow'),
    externalUnitId: varchar('external_unit_id', { length: 64 }).notNull(),
    externalProductId: varchar('external_product_id', { length: 64 }).notNull(),
    code: varchar('code', { length: 64 }),
    barcode: varchar('barcode', { length: 128 }),
    serialNumber: varchar('serial_number', { length: 255 }),
    isActive: boolean('is_active'),

    legacyData: json('legacy_data').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('lci_units_store_idx').on(table.storeId),
    productIdx: index('lci_units_product_idx').on(table.externalProductId),
    storeSourceExternalUnique: unique('lci_units_store_source_external_unique').on(
      table.storeId,
      table.sourceSystem,
      table.externalUnitId,
    ),
  }),
)
