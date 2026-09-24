CREATE TABLE IF NOT EXISTS "saved_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "collaborative" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_collections" ADD CONSTRAINT "saved_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_collection_contributors" (
  "collection_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "invited_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "saved_collection_contributors_pkey" PRIMARY KEY("collection_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "saved_collection_contributors" ADD CONSTRAINT "saved_collection_contributors_collection_id_saved_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "saved_collections"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "saved_collection_contributors" ADD CONSTRAINT "saved_collection_contributors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "saved_collection_contributors" ADD CONSTRAINT "saved_collection_contributors_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE cascade;