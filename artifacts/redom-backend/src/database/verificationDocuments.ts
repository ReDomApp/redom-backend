import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const verificationDocuments = pgTable(
  "verification_documents",
  {
    // Internal Document Record ID
    id: uuid("id").defaultRandom().primaryKey(),

    // Account Owner
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    // User-facing Verification Order Number
    verificationOrderNumber: varchar(
      "verification_order_number",
      {
        length: 30,
      }
    ).notNull(),

    // -------------------------------
    // DOCUMENT INFORMATION
    // -------------------------------

    documentType: varchar("document_type", {
      length: 30,
    }).notNull(),

    // passport
    // national_id
    // drivers_license
    // residence_permit

    // -------------------------------
    // LIVE CAMERA CAPTURES
    // -------------------------------

    frontCapture: varchar("front_capture", {
      length: 1000,
    }),

    backCapture: varchar("back_capture", {
      length: 1000,
    }),

    selfieCapture: varchar("selfie_capture", {
      length: 1000,
    }),

    livenessCapture: varchar("liveness_capture", {
      length: 1000,
    }),

    // -------------------------------
    // SECURITY VALIDATION
    // -------------------------------

    liveCaptureVerified: boolean(
      "live_capture_verified"
    )
      .default(false)
      .notNull(),

    screenshotDetected: boolean(
      "screenshot_detected"
    )
      .default(false)
      .notNull(),

    screenPhotoDetected: boolean(
      "screen_photo_detected"
    )
      .default(false)
      .notNull(),

    editedImageDetected: boolean(
      "edited_image_detected"
    )
      .default(false)
      .notNull(),

    aiGeneratedDetected: boolean(
      "ai_generated_detected"
    )
      .default(false)
      .notNull(),

    blurryImageDetected: boolean(
      "blurry_image_detected"
    )
      .default(false)
      .notNull(),

    faceMatched: boolean("face_matched")
      .default(false)
      .notNull(),

    documentMatched: boolean(
      "document_matched"
    )
      .default(false)
      .notNull(),

    // -------------------------------
    // REVIEW RESULT
    // -------------------------------

    verificationResult: varchar(
      "verification_result",
      {
        length: 30,
      }
    )
      .default("pending")
      .notNull(),

    // pending
    // approved
    // rejected
    // suspended

    reviewNotes: varchar("review_notes", {
      length: 3000,
    }),

    reviewedBy: varchar("reviewed_by", {
      length: 50,
    }),

    // persona
    // veriff
    // moderator

    // -------------------------------
    // FRAUD & MODERATION
    // -------------------------------

    fraudDetected: boolean("fraud_detected")
      .default(false)
      .notNull(),

    temporarilyBlocked: boolean(
      "temporarily_blocked"
    )
      .default(false)
      .notNull(),

    blockReason: varchar("block_reason", {
      length: 1000,
    }),

    blockLiftDate: timestamp(
      "block_lift_date"
    ),

    // -------------------------------
    // RECORD
    // -------------------------------

    capturedAt: timestamp("captured_at")
      .defaultNow()
      .notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  }
);