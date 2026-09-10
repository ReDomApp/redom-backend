ALTER TABLE "registration_flow_reservations" ADD COLUMN "gender" varchar(16);--> statement-breakpoint
ALTER TABLE "registration_flow_reservations" ADD COLUMN "pronouns" varchar(32);--> statement-breakpoint
ALTER TABLE "registration_flow_reservations" ADD CONSTRAINT "registration_flow_reservations_gender_chk" CHECK ("registration_flow_reservations"."gender" IS NULL OR "registration_flow_reservations"."gender" IN ('female', 'male', 'custom'));--> statement-breakpoint
ALTER TABLE "registration_flow_reservations" ADD CONSTRAINT "registration_flow_reservations_pronouns_chk" CHECK ("registration_flow_reservations"."pronouns" IS NULL OR "registration_flow_reservations"."pronouns" IN ('She / Her', 'He / Him', 'They / Them', 'Prefer not to say'));
