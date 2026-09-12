import { pool } from "../database/db";

let timer: NodeJS.Timeout | undefined;

export async function expireTemporaryProfilePhotos(): Promise<void> {
  await pool.query(`
    UPDATE user_profiles
       SET profile_photo=profile_photo_previous,
           profile_photo_previous=NULL,
           profile_photo_expires_at=NULL,
           updated_at=NOW()
     WHERE profile_photo_expires_at IS NOT NULL
       AND profile_photo_expires_at <= NOW()`);
}

export function startProfilePhotoExpiryCleanup(): void {
  if (timer) return;
  timer = setInterval(() => { void expireTemporaryProfilePhotos().catch(() => undefined); }, 60_000);
  timer.unref();
  void expireTemporaryProfilePhotos().catch(() => undefined);
}

export function stopProfilePhotoExpiryCleanup(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}
