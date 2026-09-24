ALTER TABLE "saves" ADD COLUMN IF NOT EXISTS "collection_id" uuid;
--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_collection_id_saved_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "saved_collections"("id") ON DELETE SET NULL;