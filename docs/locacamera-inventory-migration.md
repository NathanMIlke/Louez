# LocaCamera inventory migration contract

The LocaCamera migration keeps Louez core inventory tables operational and stores EstoqueNow traceability in dedicated extension tables.

Import order:
1. Categories -> `categories` + `locacamera_inventory_categories`
2. Tags -> `locacamera_inventory_tags`
3. Products/services/kits -> `products` + `locacamera_inventory_items`
4. Tag links -> `locacamera_inventory_item_tags`
5. Kit composition -> `locacamera_kit_items`
6. Individually tracked units, when the source exposes them -> `product_units` + `locacamera_inventory_unit_metadata`

Rules:
- `external_product_id` is the canonical EstoqueNow identity. Do not match records by code/barcode alone.
- Imports must be idempotent and use the `(store_id, source_system, external_*)` unique keys.
- Keep every source record in `legacy_data` so the migration is lossless.
- Import internal/hidden items too. `is_visible_virtualstore` records the EstoqueNow state; `storefront_visible_override` is a separate LocaCamera decision.
- Do not archive a product merely because it is hidden from the storefront. Operational/history availability and public visibility are different concerns.
- For historical orders, order lines must resolve through the external product id and then reference the native Louez `products.id`.
- For EstoqueNow type 3, preserve kit composition in `locacamera_kit_items`; do not model kit components as Louez accessories.
- Native `products.price`, `products.quantity`, `products.category_id`, images and status are the working Louez values. Source snapshots remain in the LocaCamera extension.
