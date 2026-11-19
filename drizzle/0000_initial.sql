CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" varchar(60) DEFAULT 'المنزل' NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"city" varchar(80) NOT NULL,
	"district" varchar(120),
	"street" text,
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"store_id" integer,
	"action" varchar(60) NOT NULL,
	"entity" varchar(40) NOT NULL,
	"entity_id" integer,
	"meta" jsonb,
	"ip" varchar(60),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" varchar(200) NOT NULL,
	"size" integer NOT NULL,
	"method" varchar(20) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"type" varchar(10) NOT NULL,
	"sub_order_id" integer,
	"amount" numeric(14, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(12) DEFAULT 'banner' NOT NULL,
	"image_url" text,
	"video_url" text,
	"title" varchar(160),
	"subtitle" varchar(240),
	"placement" varchar(20) DEFAULT 'home_top' NOT NULL,
	"link_type" varchar(12) DEFAULT 'none' NOT NULL,
	"link_id" integer,
	"link_url" text,
	"coupon_id" integer,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"parent_id" integer,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"sub_order_id" integer NOT NULL,
	"base_amount" numeric(14, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"type" varchar(10) NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commission_records_sub_order_id_unique" UNIQUE("sub_order_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"code" varchar(40) NOT NULL,
	"type" varchar(10) DEFAULT 'percent' NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"min_order" numeric(12, 2) DEFAULT '0' NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"type" varchar(12) DEFAULT 'custom' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"verification_token" varchar(80) NOT NULL,
	"ssl_status" varchar(20) DEFAULT 'none' NOT NULL,
	"last_checked_at" timestamp,
	"last_error" text,
	"verified_at" timestamp,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domains_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer,
	"user_id" integer,
	"filename" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"mime" varchar(80) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"store_id" integer,
	"type" varchar(30) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sub_order_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"variant_key" varchar(200),
	"image_url" text,
	"price" numeric(12, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"total" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"sub_order_id" integer NOT NULL,
	"status" varchar(24) NOT NULL,
	"note" text,
	"by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar(30) NOT NULL,
	"customer_id" integer,
	"customer_name" varchar(120) NOT NULL,
	"customer_phone" varchar(40) NOT NULL,
	"customer_email" varchar(160),
	"shipping_address" jsonb NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"shipping_total" numeric(14, 2) NOT NULL,
	"discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"tracking_token" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "payment_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"type" varchar(12) NOT NULL,
	"is_licensed" boolean DEFAULT true NOT NULL,
	"license_note" text,
	"integration_mode" varchar(12) DEFAULT 'manual' NOT NULL,
	"api_configured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payment_providers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"sub_order_id" integer NOT NULL,
	"method" varchar(20) NOT NULL,
	"account_id" integer,
	"amount" numeric(14, 2) NOT NULL,
	"reference" varchar(40) NOT NULL,
	"sender_name" varchar(120),
	"sender_phone" varchar(40),
	"transfer_ref" varchar(120),
	"receipt_url" text,
	"status" varchar(16) DEFAULT 'under_review' NOT NULL,
	"review_note" text,
	"verified_by" integer,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"name_en" varchar(80) NOT NULL,
	"price_monthly" numeric(12, 2) DEFAULT '0' NOT NULL,
	"max_products" integer DEFAULT 20 NOT NULL,
	"max_domains" integer DEFAULT 0 NOT NULL,
	"max_staff" integer DEFAULT 0 NOT NULL,
	"premium_templates" boolean DEFAULT false NOT NULL,
	"marketing_tools" boolean DEFAULT false NOT NULL,
	"page_builder" boolean DEFAULT true NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"category_id" integer,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"price" numeric(12, 2) NOT NULL,
	"compare_at_price" numeric(12, 2),
	"cost_price" numeric(12, 2),
	"sku" varchar(80),
	"stock" integer DEFAULT 0 NOT NULL,
	"low_stock_alert" integer DEFAULT 5 NOT NULL,
	"weight_kg" numeric(8, 3) DEFAULT '0' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sales_count" integer DEFAULT 0 NOT NULL,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"cities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"type" varchar(12) DEFAULT 'flat' NOT NULL,
	"base_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"per_kg_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"free_above" numeric(12, 2),
	"eta_days" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"user_id" integer,
	"name" varchar(120) NOT NULL,
	"phone" varchar(40),
	"email" varchar(160),
	"orders_count" integer DEFAULT 0 NOT NULL,
	"total_spent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"is_home" boolean DEFAULT false NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_payment_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"account_name" varchar(120) NOT NULL,
	"account_number_enc" text NOT NULL,
	"account_number_last4" varchar(8) NOT NULL,
	"iban_enc" text,
	"phone" varchar(40),
	"branch" varchar(120),
	"proof_url" text,
	"instructions" text,
	"verification_status" varchar(12) DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"method" varchar(20) NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"cod_fee" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(20) DEFAULT 'manager' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(60) NOT NULL,
	"description" text,
	"logo_url" text,
	"cover_url" text,
	"phone" varchar(40),
	"email" varchar(160),
	"city" varchar(80),
	"address" text,
	"currency" varchar(5) DEFAULT 'YER' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"plan_id" integer,
	"template_id" integer,
	"theme" jsonb,
	"sections_order" jsonb,
	"commission_type" varchar(10),
	"commission_value" numeric(12, 2),
	"seo_title" varchar(160),
	"seo_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sub_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"number" varchar(40) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"shipping_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cod_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"commission_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"payment_status" varchar(24) DEFAULT 'unpaid' NOT NULL,
	"payment_account_id" integer,
	"payment_reference" varchar(40) NOT NULL,
	"shipping_zone_id" integer,
	"coupon_id" integer,
	"campaign_id" integer,
	"customer_note" text,
	"merchant_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"category" varchar(40) NOT NULL,
	"description" text,
	"preview_url" text,
	"default_theme" jsonb NOT NULL,
	"default_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(160) NOT NULL,
	"phone" varchar(40),
	"password_hash" text NOT NULL,
	"role" varchar(20) DEFAULT 'customer' NOT NULL,
	"locale" varchar(5) DEFAULT 'ar' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "campaign_events_idx" ON "campaign_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaigns_store_idx" ON "campaigns" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug" ON "categories" USING btree ("store_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code" ON "coupons" USING btree ("store_id","code");--> statement-breakpoint
CREATE INDEX "domains_store_idx" ON "domains" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notif_store_idx" ON "notifications" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "pt_store_idx" ON "payment_transactions" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug" ON "products" USING btree ("store_id","slug");--> statement-breakpoint
CREATE INDEX "products_store_idx" ON "products" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_customers_store_idx" ON "store_customers" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_pages_slug" ON "store_pages" USING btree ("store_id","slug");--> statement-breakpoint
CREATE INDEX "spa_store_idx" ON "store_payment_accounts" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spm_unique" ON "store_payment_methods" USING btree ("store_id","method");--> statement-breakpoint
CREATE UNIQUE INDEX "store_staff_unique" ON "store_staff" USING btree ("store_id","user_id");--> statement-breakpoint
CREATE INDEX "stores_owner_idx" ON "stores" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "sub_orders_store_idx" ON "sub_orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "sub_orders_order_idx" ON "sub_orders" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_unique" ON "wishlists" USING btree ("user_id","product_id");