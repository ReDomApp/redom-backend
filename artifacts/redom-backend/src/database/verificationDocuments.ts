import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const verificationDocuments =
  pgTable(
    "verification_documents",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      userId: uuid("user_id")
        .notNull()
        .references(
          () => users.id,
          {
            onDelete:
              "cascade",
          },
        ),

      verificationOrderNumber:
        varchar(
          "verification_order_number",
          {
            length: 30,
          },
        )
          .notNull()
          .unique(),

      documentType:
        varchar(
          "document_type",
          {
            length: 50,
          },
        ).notNull(),

      countryCode:
        varchar(
          "country_code",
          {
            length: 2,
          },
        ),

      frontCapture:
        varchar(
          "front_capture",
          {
            length: 2000,
          },
        ),

      backCapture:
        varchar(
          "back_capture",
          {
            length: 2000,
          },
        ),

      selfieCapture:
        varchar(
          "selfie_capture",
          {
            length: 2000,
          },
        ),

      livenessCapture:
        varchar(
          "liveness_capture",
          {
            length: 2000,
          },
        ),

      liveCaptureVerified:
        boolean(
          "live_capture_verified",
        )
          .default(false)
          .notNull(),

      screenshotDetected:
        boolean(
          "screenshot_detected",
        )
          .default(false)
          .notNull(),

      screenPhotoDetected:
        boolean(
          "screen_photo_detected",
        )
          .default(false)
          .notNull(),

      editedImageDetected:
        boolean(
          "edited_image_detected",
        )
          .default(false)
          .notNull(),

      aiGeneratedDetected:
        boolean(
          "ai_generated_detected",
        )
          .default(false)
          .notNull(),

      blurryImageDetected:
        boolean(
          "blurry_image_detected",
        )
          .default(false)
          .notNull(),

      faceMatched:
        boolean(
          "face_matched",
        )
          .default(false)
          .notNull(),

      documentMatched:
        boolean(
          "document_matched",
        )
          .default(false)
          .notNull(),

      verificationResult:
        varchar(
          "verification_result",
          {
            length: 30,
          },
        )
          .default("pending")
          .notNull(),

      reviewNotes:
        varchar(
          "review_notes",
          {
            length: 3000,
          },
        ),

      reviewedBy:
        varchar(
          "reviewed_by",
          {
            length: 100,
          },
        ),

      reviewProvider:
        varchar(
          "review_provider",
          {
            length: 100,
          },
        ),

      providerReference:
        varchar(
          "provider_reference",
          {
            length: 255,
          },
        ),

      providerSessionId:
        varchar(
          "provider_session_id",
          {
            length: 255,
          },
        ),

      providerStatus:
        varchar(
          "provider_status",
          {
            length: 100,
          },
        ),

      providerUpdatedAt:
        timestamp(
          "provider_updated_at",
        ),

      fraudDetected:
        boolean(
          "fraud_detected",
        )
          .default(false)
          .notNull(),

      temporarilyBlocked:
        boolean(
          "temporarily_blocked",
        )
          .default(false)
          .notNull(),

      blockReason:
        varchar(
          "block_reason",
          {
            length: 1000,
          },
        ),

      blockLiftDate:
        timestamp(
          "block_lift_date",
        ),

      capturedAt:
        timestamp(
          "captured_at",
        )
          .defaultNow()
          .notNull(),

      createdAt:
        timestamp(
          "created_at",
        )
          .defaultNow()
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
        )
          .defaultNow()
          .notNull(),
    },

    (table) => ({
      userIdx:
        index(
          "verification_documents_user_idx",
        ).on(
          table.userId,
        ),

      resultIdx:
        index(
          "verification_documents_result_idx",
        ).on(
          table.verificationResult,
        ),

      typeIdx:
        index(
          "verification_documents_type_idx",
        ).on(
          table.documentType,
        ),

      providerReferenceIdx:
        index(
          "verification_documents_provider_reference_idx",
        ).on(
          table.providerReference,
        ),
    }),
  );