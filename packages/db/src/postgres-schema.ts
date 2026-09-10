import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

const id = () =>
  varchar("id", { length: 21 })
    .primaryKey()
    .$defaultFn(() => nanoid());

export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);
export const pricingModeEnum = pgEnum("pricing_mode", ["hour", "day", "week"]);
export const pricingKindEnum = pgEnum("pricing_kind", ["duration", "fixed"]);
export const stockKindEnum = pgEnum("stock_kind", ["returnable", "consumable", "untracked"]);
export const customerType = pgEnum("customer_type", ["individual", "business"]);
export const customerApprovalStatus = pgEnum("customer_approval_status", [
  "pending",
  "approved",
  "rejected",
]);
export const reservationStatus = pgEnum("reservation_status", [
  "pending",
  "confirmed",
  "ongoing",
  "completed",
  "cancelled",
  "rejected",
  "quote",
  "declined",
]);
export const reservationPaymentStatus = pgEnum("reservation_payment_status", [
  "pending",
  "partial",
  "paid",
  "refunded",
]);
export const reservationFiscalStatus = pgEnum("reservation_fiscal_status", [
  "not_ready",
  "review",
  "ready",
  "issued",
  "cancelled",
  "error",
]);
export const unitLifecycleStatus = pgEnum("unit_lifecycle_status", ["active", "retired"]);
export const unitRetirementReason = pgEnum("unit_retirement_reason", [
  "sold",
  "lost",
  "broken",
  "other",
]);
export const unitDowntimeReason = pgEnum("unit_downtime_reason", [
  "maintenance",
  "repair",
  "other",
]);
export const paymentType = pgEnum("payment_type", [
  "rental",
  "deposit",
  "deposit_hold",
  "deposit_capture",
  "deposit_return",
  "damage",
  "adjustment",
]);
export const paymentMethod = pgEnum("payment_method", [
  "pix",
  "stripe",
  "cash",
  "card",
  "transfer",
  "check",
  "other",
]);
export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "authorized",
  "completed",
  "failed",
  "cancelled",
  "refunded",
]);
export const activityType = pgEnum("activity_type", [
  "created",
  "confirmed",
  "rejected",
  "cancelled",
  "picked_up",
  "returned",
  "note_updated",
  "payment_added",
  "payment_updated",
  "payment_received",
  "payment_initiated",
  "payment_failed",
  "payment_expired",
  "deposit_authorized",
  "deposit_captured",
  "deposit_released",
  "deposit_failed",
  "access_link_sent",
  "modified",
  "inspection_departure_started",
  "inspection_departure_completed",
  "inspection_return_started",
  "inspection_return_completed",
  "inspection_damage_detected",
  "inspection_signed",
  "quote_accepted",
  "quote_declined",
]);

export const users = pgTable("users", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  image: text("image"),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: varchar("provider", { length: 255 }).notNull(),
    accountId: varchar("provider_account_id", { length: 255 }).notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
    scope: varchar("scope", { length: 255 }),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    providerIdx: unique("accounts_provider_idx").on(table.providerId, table.accountId),
    userIdx: index("accounts_user_idx").on(table.userId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    userId: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("sessions_user_idx").on(table.userId),
    tokenIdx: index("sessions_token_idx").on(table.token),
  }),
);

export const verification = pgTable("verification", {
  id: id(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const stores = pgTable(
  "stores",
  {
    id: id(),
    userId: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    address: text("address"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    logoUrl: text("logo_url"),
    darkLogoUrl: text("dark_logo_url"),
    settings: jsonb("settings").notNull(),
    theme: jsonb("theme").notNull(),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index("stores_slug_idx").on(table.slug),
    userIdx: index("stores_user_idx").on(table.userId),
  }),
);

export const storeMembers = pgTable(
  "store_members",
  {
    id: id(),
    storeId: varchar("store_id", { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("member"),
    addedBy: varchar("added_by", { length: 21 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueMembership: unique("store_members_unique").on(table.storeId, table.userId),
    storeIdx: index("store_members_store_idx").on(table.storeId),
    userIdx: index("store_members_user_idx").on(table.userId),
  }),
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    storeId: varchar("store_id", { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    storeSlugUnique: unique("categories_store_slug_unique").on(table.storeId, table.slug),
    storeIdx: index("categories_store_idx").on(table.storeId),
  }),
);

export const products = pgTable(
  "products",
  {
    id: id(),
    storeId: varchar("store_id", { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    categoryId: varchar("category_id", { length: 21 }).references(() => categories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    aiContext: text("ai_context"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    imageHistory: jsonb("image_history").$type<unknown[]>().notNull().default([]),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    deposit: numeric("deposit", { precision: 10, scale: 2 }).notNull().default("0"),
    basePeriodMinutes: integer("base_period_minutes"),
    pricingMode: pricingModeEnum("pricing_mode").notNull().default("day"),
    pricingKind: pricingKindEnum("pricing_kind").notNull().default("duration"),
    stockKind: stockKindEnum("stock_kind").notNull().default("returnable"),
    quantity: integer("quantity").notNull().default(1),
    trackUnits: boolean("track_units").notNull().default(false),
    bookingAttributeAxes: jsonb("booking_attribute_axes"),
    displayOrder: integer("display_order").notNull().default(0),
    status: productStatus("status").notNull().default("active"),
    tags: text("tags").array().notNull().default([]),
    isVisible: boolean("is_visible").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    legacyEstoqueNowId: varchar("legacy_estoquenow_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index("products_store_idx").on(table.storeId),
    categoryIdx: index("products_category_idx").on(table.categoryId),
    statusIdx: index("products_status_idx").on(table.status),
    storeStatusNameIdx: index("products_store_status_name_idx").on(
      table.storeId,
      table.status,
      table.name,
    ),
    visibleIdx: index("products_visible_idx").on(table.storeId, table.isVisible, table.status),
  }),
);

export const productUnits = pgTable(
  "product_units",
  {
    id: id(),
    productId: varchar("product_id", { length: 21 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    notes: text("notes"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    attributes: jsonb("attributes").$type<Record<string, string>>(),
    combinationKey: varchar("combination_key", { length: 255 }).notNull().default("__default"),
    lifecycleStatus: unitLifecycleStatus("lifecycle_status").notNull().default("active"),
    retiredAt: timestamp("retired_at", { withTimezone: true, mode: "date" }),
    retirementReason: unitRetirementReason("retirement_reason"),
    retirementNote: text("retirement_note"),
    purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }),
    purchasedAt: timestamp("purchased_at", { withTimezone: true, mode: "date" }),
    legacyEstoqueNowId: varchar("legacy_estoquenow_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    productIdx: index("product_units_product_idx").on(table.productId),
    uniqueIdentifierPerProduct: unique("product_units_unique_identifier").on(
      table.productId,
      table.identifier,
    ),
    lifecycleStatusIdx: index("product_units_lifecycle_status_idx").on(
      table.productId,
      table.lifecycleStatus,
    ),
    lifecycleStatusCombinationIdx: index("product_units_lifecycle_status_combination_idx").on(
      table.productId,
      table.lifecycleStatus,
      table.combinationKey,
    ),
  }),
);

export const productUnitDowntimes = pgTable(
  "product_unit_downtimes",
  {
    id: id(),
    productUnitId: varchar("product_unit_id", { length: 21 })
      .notNull()
      .references(() => productUnits.id, { onDelete: "cascade" }),
    storeId: varchar("store_id", { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    reason: unitDowntimeReason("reason").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    note: text("note"),
    createdByUserId: varchar("created_by_user_id", { length: 21 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    unitStartsAtIdx: index("product_unit_downtimes_unit_starts_at_idx").on(
      table.productUnitId,
      table.startsAt,
    ),
    activeAtIdx: index("product_unit_downtimes_active_at_idx").on(
      table.storeId,
      table.startsAt,
      table.endsAt,
    ),
  }),
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    storeId: varchar("store_id", { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    customerType: customerType("customer_type").notNull().default("individual"),
    email: varchar("email", { length: 255 }),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull().default(""),
    companyName: varchar("company_name", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    address: text("address"),
    city: varchar("city", { length: 255 }),
    state: varchar("state", { length: 2 }),
    postalCode: varchar("postal_code", { length: 8 }),
    country: varchar("country", { length: 2 }).notNull().default("BR"),
    cpf: varchar("cpf", { length: 11 }),
    cnpj: varchar("cnpj", { length: 14 }),
    rg: varchar("rg", { length: 32 }),
    approvalStatus: customerApprovalStatus("approval_status").notNull().default("pending"),
    proofOfAddressUrl: text("proof_of_address_url"),
    notes: text("notes"),
    legacyEstoqueNowId: varchar("legacy_estoquenow_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index("customers_store_idx").on(table.storeId),
    emailIdx: index("customers_email_idx").on(table.email),
    approvalIdx: index("customers_approval_idx").on(table.storeId, table.approvalStatus),
  }),
);

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    storeId: varchar("store_id", { length: 21 })
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    customerId: varchar("customer_id", { length: 21 })
      .notNull()
      .references(() => customers.id),
    number: varchar("number", { length: 50 }).notNull(),
    status: reservationStatus("status").notNull().default("pending"),
    paymentStatus: reservationPaymentStatus("payment_status").notNull().default("pending"),
    fiscalStatus: reservationFiscalStatus("fiscal_status").notNull().default("not_ready"),
    startDate: timestamp("start_date", { withTimezone: true, mode: "date" }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true, mode: "date" }).notNull(),
    subtotalAmount: numeric("subtotal_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    source: varchar("source", { length: 32 }).notNull().default("online"),
    notes: text("notes"),
    pickupAt: timestamp("pickup_at", { withTimezone: true, mode: "date" }),
    returnedAt: timestamp("returned_at", { withTimezone: true, mode: "date" }),
    legacyEstoqueNowId: varchar("legacy_estoquenow_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    storeNumberUnique: unique("reservations_store_number_unique").on(table.storeId, table.number),
    storeIdx: index("reservations_store_idx").on(table.storeId),
    customerIdx: index("reservations_customer_idx").on(table.customerId),
    statusIdx: index("reservations_status_idx").on(table.storeId, table.status),
    dateIdx: index("reservations_date_idx").on(table.storeId, table.startDate, table.endDate),
    paymentStatusIdx: index("reservations_payment_status_idx").on(table.storeId, table.paymentStatus),
    fiscalStatusIdx: index("reservations_fiscal_status_idx").on(table.storeId, table.fiscalStatus),
  }),
);

export const reservationItems = pgTable(
  "reservation_items",
  {
    id: id(),
    reservationId: varchar("reservation_id", { length: 21 })
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    productId: varchar("product_id", { length: 21 }).references(() => products.id, {
      onDelete: "set null",
    }),
    isCustomItem: boolean("is_custom_item").notNull().default(false),
    quantity: integer("quantity").notNull(),
    consumedQuantity: integer("consumed_quantity").notNull().default(0),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    depositPerUnit: numeric("deposit_per_unit", { precision: 10, scale: 2 }).notNull().default("0"),
    totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
    pricingBreakdown: jsonb("pricing_breakdown"),
    productSnapshot: jsonb("product_snapshot").notNull(),
    combinationKey: varchar("combination_key", { length: 255 }),
    selectedAttributes: jsonb("selected_attributes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    reservationIdx: index("reservation_items_reservation_idx").on(table.reservationId),
    productCombinationIdx: index("reservation_items_product_combination_idx").on(
      table.productId,
      table.combinationKey,
    ),
  }),
);

export const reservationItemUnits = pgTable(
  "reservation_item_units",
  {
    id: id(),
    reservationItemId: varchar("reservation_item_id", { length: 21 })
      .notNull()
      .references(() => reservationItems.id, { onDelete: "cascade" }),
    productUnitId: varchar("product_unit_id", { length: 21 }).references(() => productUnits.id, {
      onDelete: "set null",
    }),
    identifierSnapshot: varchar("identifier_snapshot", { length: 255 }).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    reservationItemIdx: index("reservation_item_units_item_idx").on(table.reservationItemId),
    productUnitIdx: index("reservation_item_units_unit_idx").on(table.productUnitId),
    uniqueAssignment: unique("reservation_item_units_unique").on(
      table.reservationItemId,
      table.productUnitId,
    ),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    reservationId: varchar("reservation_id", { length: 21 })
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    type: paymentType("type").notNull(),
    method: paymentMethod("method").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    provider: varchar("provider", { length: 32 }),
    providerTransactionId: varchar("provider_transaction_id", { length: 255 }),
    currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
    notes: text("notes"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    reservationIdx: index("payments_reservation_idx").on(table.reservationId),
  }),
);

export const reservationActivity = pgTable(
  "reservation_activity",
  {
    id: id(),
    reservationId: varchar("reservation_id", { length: 21 })
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 21 }).references(() => users.id, { onDelete: "set null" }),
    activityType: activityType("activity_type").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    reservationIdx: index("reservation_activity_reservation_idx").on(table.reservationId),
    userIdx: index("reservation_activity_user_idx").on(table.userId),
  }),
);

export const CORE_POSTGRES_TABLES = [
  "users",
  "accounts",
  "sessions",
  "verification",
  "stores",
  "store_members",
  "categories",
  "products",
  "product_units",
  "product_unit_downtimes",
  "customers",
  "reservations",
  "reservation_items",
  "reservation_item_units",
  "payments",
  "reservation_activity",
] as const;
