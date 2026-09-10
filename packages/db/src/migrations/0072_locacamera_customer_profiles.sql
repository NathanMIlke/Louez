CREATE TABLE `locacamera_customer_profiles` (
  `customer_id` varchar(21) NOT NULL,
  `store_id` varchar(21) NOT NULL,
  `estoquenow_client_id` varchar(64),
  `instagram` varchar(255),
  `acquisition_source` varchar(255),
  `registered_at` timestamp NULL,
  `pinned_files` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `locacamera_customer_profiles_store_estoquenow_unique` (`store_id`, `estoquenow_client_id`),
  KEY `locacamera_customer_profiles_store_idx` (`store_id`)
);
