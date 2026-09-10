CREATE TABLE `locacamera_payment_methods` (
  `id` varchar(21) NOT NULL,
  `store_id` varchar(21) NOT NULL,
  `source_system` varchar(32) NOT NULL DEFAULT 'estoquenow',
  `external_id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` varchar(64) NULL,
  `application` varchar(128) NULL,
  `can_edit` boolean NULL,
  `payment_service_id` varchar(64) NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `locacamera_payment_methods_store_source_external_unique` (`store_id`,`source_system`,`external_id`),
  KEY `locacamera_payment_methods_store_idx` (`store_id`),
  CONSTRAINT `locacamera_payment_methods_store_fk`
    FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `locacamera_payment_metadata` (
  `payment_id` varchar(21) NOT NULL,
  `store_id` varchar(21) NOT NULL,
  `payment_method_id` varchar(21) NULL,
  `payment_method_name_snapshot` varchar(255) NULL,
  `source_system` varchar(32) NOT NULL DEFAULT 'estoquenow',
  `external_payment_id` varchar(64) NULL,
  `external_order_id` varchar(64) NULL,
  `legacy_data` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `locacamera_payment_metadata_source_payment_unique` (`source_system`,`external_payment_id`),
  KEY `locacamera_payment_metadata_store_idx` (`store_id`),
  KEY `locacamera_payment_metadata_method_idx` (`payment_method_id`),
  KEY `locacamera_payment_metadata_external_order_idx` (`source_system`,`external_order_id`),
  CONSTRAINT `locacamera_payment_metadata_payment_fk`
    FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `locacamera_payment_metadata_store_fk`
    FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `locacamera_payment_metadata_method_fk`
    FOREIGN KEY (`payment_method_id`) REFERENCES `locacamera_payment_methods` (`id`) ON DELETE SET NULL
);
