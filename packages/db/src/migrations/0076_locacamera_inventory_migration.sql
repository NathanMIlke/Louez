CREATE TABLE `locacamera_inventory_categories` (
  `category_id` varchar(21) NOT NULL,
  `store_id` varchar(21) NOT NULL,
  `source_system` varchar(32) NOT NULL DEFAULT 'estoquenow',
  `external_category_id` varchar(64) NOT NULL,
  `external_company_id` varchar(64) NULL,
  `prefix` varchar(64) NULL,
  `uri` varchar(255) NULL,
  `source_order` int NULL,
  `is_visible_virtualstore` boolean NULL,
  `source_image_url` text NULL,
  `legacy_data` json NULL,
  `synced_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `lci_categories_store_source_external_unique` (`store_id`,`source_system`,`external_category_id`),
  KEY `lci_categories_store_idx` (`store_id`),
  CONSTRAINT `lci_cat_category_fk`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lci_cat_store_fk`
    FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `locacamera_inventory_items` (
  `product_id` varchar(21) NOT NULL,
  `store_id` varchar(21) NOT NULL,
  `source_system` varchar(32) NOT NULL DEFAULT 'estoquenow',
  `external_product_id` varchar(64) NOT NULL,
  `external_company_id` varchar(64) NULL,
  `code` varchar(64) NULL,
  `barcode` varchar(128) NULL,
  `external_type` int NULL,
  `management_type` varchar(32) NULL,
  `source_unit_price` decimal(12,2) NULL,
  `promotional_unit_price` decimal(12,2) NULL,
  `unit_price_for_pj` decimal(12,2) NULL,
  `buy_price` decimal(12,2) NULL,
  `unit_cost_price` decimal(12,2) NULL,
  `reposition_price` decimal(12,2) NULL,
  `failure_price` decimal(12,2) NULL,
  `source_quantity` int NULL,
  `maintaining_quantity` int NULL,
  `unit_type` varchar(32) NULL,
  `external_category_id` varchar(64) NULL,
  `external_category_name_snapshot` varchar(255) NULL,
  `provider_id` varchar(64) NULL,
  `is_enabled` boolean NULL,
  `is_visible_virtualstore` boolean NULL,
  `is_highlighted` boolean NULL,
  `is_archived` boolean NULL,
  `is_favorite_item` boolean NULL,
  `has_inventory_managed` boolean NULL,
  `storefront_visible_override` boolean NULL,
  `featured_override` boolean NULL,
  `keywords` text NULL,
  `observations` text NULL,
  `uri` varchar(255) NULL,
  `source_image_urls` json NULL,
  `source_video_url` text NULL,
  `dimensions` json NULL,
  `kit_settings` json NULL,
  `minutes_blocked_before_delivery` int NULL,
  `minutes_blocked_after_return` int NULL,
  `quantity_times_rented` int NULL,
  `source_created_at` timestamp NULL,
  `source_updated_at` timestamp NULL,
  `synced_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `legacy_data` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `lci_items_store_source_external_unique` (`store_id`,`source_system`,`external_product_id`),
  KEY `lci_items_store_idx` (`store_id`),
  KEY `lci_items_category_idx` (`store_id`,`external_category_id`),
  KEY `lci_items_code_idx` (`store_id`,`code`),
  KEY `lci_items_barcode_idx` (`store_id`,`barcode`),
  KEY `lci_items_visibility_idx` (`store_id`,`is_visible_virtualstore`,`storefront_visible_override`),
  CONSTRAINT `lci_item_product_fk`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lci_item_store_fk`
    FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `locacamera_inventory_tags` (
  `id` varchar(21) NOT NULL,
  `store_id` varchar(21) NOT NULL,
  `source_system` varchar(32) NOT NULL DEFAULT 'estoquenow',
  `external_tag_id` varchar(64) NOT NULL,
  `external_company_id` varchar(64) NULL,
  `name` varchar(255) NOT NULL,
  `is_visible_virtualstore` boolean NULL,
  `legacy_data` json NULL,
  `synced_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lci_tags_store_source_external_unique` (`store_id`,`source_system`,`external_tag_id`),
  KEY `lci_tags_store_idx` (`store_id`),
  KEY `lci_tags_name_idx` (`store_id`,`name`),
  CONSTRAINT `lci_tag_store_fk`
    FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `locacamera_inventory_item_tags` (
  `id` varchar(21) NOT NULL,
  `product_id` varchar(21) NOT NULL,
  `tag_id` varchar(21) NOT NULL,
  `source_system` varchar(32) NOT NULL DEFAULT 'estoquenow',
  `external_product_id` varchar(64) NULL,
  `external_tag_id` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lci_item_tags_product_tag_unique` (`product_id`,`tag_id`),
  KEY `lci_item_tags_product_idx` (`product_id`),
  KEY `lci_item_tags_tag_idx` (`tag_id`),
  CONSTRAINT `lci_item_tag_product_fk`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lci_item_tag_tag_fk`
    FOREIGN KEY (`tag_id`) REFERENCES `locacamera_inventory_tags` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `locacamera_kit_items` (
  `id` varchar(21) NOT NULL,
  `store_id` varchar(21) NOT NULL,
  `kit_product_id` varchar(21) NOT NULL,
  `component_product_id` varchar(21) NULL,
  `source_system` varchar(32) NOT NULL DEFAULT 'estoquenow',
  `external_kit_product_id` varchar(64) NOT NULL,
  `external_component_product_id` varchar(64) NOT NULL,
  `quantity` decimal(10,3) NOT NULL DEFAULT 1,
  `unit_price` decimal(12,2) NULL,
  `legacy_data` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lci_kit_items_source_unique` (`store_id`,`source_system`,`external_kit_product_id`,`external_component_product_id`),
  KEY `lci_kit_items_kit_idx` (`kit_product_id`),
  KEY `lci_kit_items_component_idx` (`component_product_id`),
  CONSTRAINT `lci_kit_store_fk`
    FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lci_kit_product_fk`
    FOREIGN KEY (`kit_product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lci_kit_component_fk`
    FOREIGN KEY (`component_product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `locacamera_inventory_unit_metadata` (
  `product_unit_id` varchar(21) NOT NULL,
  `store_id` varchar(21) NOT NULL,
  `source_system` varchar(32) NOT NULL DEFAULT 'estoquenow',
  `external_unit_id` varchar(64) NOT NULL,
  `external_product_id` varchar(64) NOT NULL,
  `code` varchar(64) NULL,
  `barcode` varchar(128) NULL,
  `serial_number` varchar(255) NULL,
  `is_active` boolean NULL,
  `legacy_data` json NULL,
  `synced_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_unit_id`),
  UNIQUE KEY `lci_units_store_source_external_unique` (`store_id`,`source_system`,`external_unit_id`),
  KEY `lci_units_store_idx` (`store_id`),
  KEY `lci_units_product_idx` (`external_product_id`),
  CONSTRAINT `lci_unit_product_unit_fk`
    FOREIGN KEY (`product_unit_id`) REFERENCES `product_units` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lci_unit_store_fk`
    FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
);