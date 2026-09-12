import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";

const router = Router();

const mediaUrl = (req: Request, key: string | null) => {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get("host");
  if (!host) return key;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${protocol}://${host}/profile/media/file/${encodedKey}`;
};

const formatDate = (value: string | Date | null) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

const formatMonthYear = (value: string | Date | null) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

async function getProfile(req: Request, res: Response) {
  try {
    const viewerId = req.user.userId;
    const viewerProfileId = req.user.profileId;
    const requestedId = req.params.userId || viewerId;

    const profileResult = await pool.query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.username,
         u.public_id,
         u.profile_id,
         u.profile_share_code,
         u.date_of_birth,
         lh.login_time AS joined_at,
         p.profile_photo,
         p.cover_photo,
         p.current_city,
         p.hometown,
         p.bio,
         p.bio_privacy,
         p.current_city_privacy,
         p.hometown_privacy,
         p.birthday_month_day_privacy,
         p.birthday_year_privacy,
         p.profile_visibility,
         p.verified,
         p.display_join_date,
         p.friend_count,
         p.follower_count,
         p.post_count,
         lh.country AS joined_country
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT login_time, country
         FROM login_history
         WHERE user_id = u.id
         ORDER BY login_time ASC
         LIMIT 1
       ) lh ON true
       WHERE u.id::text = $1::text
          OR u.public_id::text = $1::text
          OR u.profile_id::text = $1::text
          OR u.profile_share_code = $1::text
       LIMIT 1`,
      [String(requestedId)],
    );

    if (!profileResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    const profile = profileResult.rows[0];
    const owner =
      profile.id === viewerId ||
      profile.profile_id === viewerProfileId;

    const relationship = owner ? { friend: true, friends_of_friends: true } : ((await pool.query(
      `SELECT
         EXISTS (SELECT 1 FROM friends f WHERE ((f.user_id=$1 AND f.friend_user_id=$2) OR (f.user_id=$2 AND f.friend_user_id=$1)) AND f.friendship_status='active') AS friend,
         EXISTS (SELECT 1 FROM friends f1 JOIN friends f2 ON f2.user_id=f1.friend_user_id WHERE f1.user_id=$1 AND f1.friendship_status='active' AND f2.friend_user_id=$2 AND f2.friendship_status='active') AS friends_of_friends`,
      [viewerId, profile.id],
    )).rows[0] || { friend: false, friends_of_friends: false });

    const canSee = (privacy: string | null | undefined) => {
      if (owner || privacy === 'public') return true;
      if (privacy === 'friends') return !!relationship.friend;
      if (privacy === 'friends_of_friends') return !!relationship.friends_of_friends;
      return false;
    };

    if (!owner && profile.profile_visibility === "private") {
      return res.json({
        success: true,
        profile: {
          userId: profile.id,
          firstName: profile.first_name,
          lastName: profile.last_name,
          username: profile.username,
          publicId: profile.public_id,
          profileId: null,
          shareCode: profile.profile_share_code,
          shareUrl: `https://redom.app/profile/username/${profile.profile_share_code}`,
          profilePhoto: mediaUrl(req, profile.profile_photo),
          coverPhoto: mediaUrl(req, profile.cover_photo),
          friendCount: profile.friend_count ?? 0,
          followerCount: profile.follower_count ?? 0,
          postCount: profile.post_count ?? 0,
          location: null,
          hometown: null,
          bio: null,
          birthday: null,
          joinedAt: formatMonthYear(profile.joined_at),
          joinedCountry: profile.joined_country || "",
          verified: !!profile.verified,
          isOwner: false,
          friends: [],
          reels: [],
          photos: [],
          posts: [],
          suggestions: [],
        },
      });
    }

    const [friends, posts, reels, photos, suggestions] = await Promise.all([
      pool.query(
        `SELECT u.id,u.first_name,u.last_name,u.username,p.profile_photo
         FROM friends f
         JOIN users u ON u.id=f.friend_user_id
         LEFT JOIN user_profiles p ON p.user_id=u.id
         WHERE f.user_id=$1 AND f.friendship_status='active'
         ORDER BY f.friends_since DESC LIMIT 50`,
        [profile.id],
      ),
      pool.query(
        `SELECT p.id,p.type,p.content,p.published_at,pm.object_key,pm.thumbnail_key
         FROM posts p
         LEFT JOIN LATERAL (
           SELECT object_key,thumbnail_key
           FROM post_media
           WHERE post_id=p.id AND processing_status<>'failed'
           ORDER BY is_primary DESC,display_order ASC LIMIT 1
         ) pm ON true
         WHERE p.user_id=$1 AND p.deleted=false
         ORDER BY p.published_at DESC LIMIT 50`,
        [profile.id],
      ),
      pool.query(
        `SELECT p.id,p.published_at,pm.id AS media_id,pm.object_key,pm.thumbnail_key,
         COALESCE((SELECT COUNT(*) FROM video_views vv WHERE vv.media_id=pm.id AND vv.invalid_view=false),0)::int AS view_count
         FROM posts p
         JOIN post_media pm ON pm.post_id=p.id
         WHERE p.user_id=$1 AND p.deleted=false
           AND (p.type ILIKE '%reel%' OR pm.media_type ILIKE 'video%')
         ORDER BY p.published_at DESC LIMIT 20`,
        [profile.id],
      ),
      pool.query(
        `SELECT p.id,p.published_at,pm.object_key,pm.thumbnail_key
         FROM posts p
         JOIN post_media pm ON pm.post_id=p.id
         WHERE p.user_id=$1 AND p.deleted=false AND pm.media_type ILIKE 'image%'
         ORDER BY p.published_at DESC LIMIT 30`,
        [profile.id],
      ),
      pool.query(
        `SELECT u.id,u.first_name,u.last_name,u.username,u.public_id,u.profile_id,
         p.profile_photo,p.current_city,p.friend_count
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id=u.id
         WHERE u.id<>$1
           AND COALESCE(p.profile_visibility,'public')<>'private'
           AND NOT EXISTS(
             SELECT 1 FROM friends f
             WHERE f.user_id=$1 AND f.friend_user_id=u.id AND f.friendship_status='active'
           )
           AND NOT EXISTS(
             SELECT 1 FROM friends f
             WHERE f.user_id=u.id AND f.friend_user_id=$1 AND f.friendship_status='active'
           )
         ORDER BY p.friend_count DESC NULLS LAST,u.created_at DESC LIMIT 12`,
        [viewerId],
      ),
    ]);

    const result = {
      userId: profile.id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      username: profile.username,
      publicId: profile.public_id,
      profileId: profile.profile_id,
      shareCode: profile.profile_share_code,
      shareUrl: `https://redom.app/profile/username/${profile.profile_share_code}`,
      profilePhoto: mediaUrl(req, profile.profile_photo),
      coverPhoto: mediaUrl(req, profile.cover_photo),
      friendCount: profile.friend_count ?? friends.rowCount ?? 0,
      followerCount: profile.follower_count ?? 0,
      postCount: profile.post_count ?? posts.rowCount ?? 0,
      bio: canSee(profile.bio_privacy) ? (profile.bio || null) : null,
      location: canSee(profile.current_city_privacy) ? (profile.current_city || null) : null,
      hometown: canSee(profile.hometown_privacy) ? (profile.hometown || null) : null,
      birthday: profile.date_of_birth ? (() => {
        const d = new Date(profile.date_of_birth);
        const monthDay = canSee(profile.birthday_month_day_privacy);
        const year = canSee(profile.birthday_year_privacy);
        if (monthDay && year) return formatDate(profile.date_of_birth);
        if (monthDay) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        if (year) return d.toLocaleDateString('en-US', { year: 'numeric' });
        return null;
      })() : null,
      joinedAt: formatMonthYear(profile.joined_at),
      joinedCountry: profile.joined_country || "",
      verified: !!profile.verified,
      isOwner: owner,
      friends: friends.rows.map((f) => ({
        userId: f.id,
        firstName: f.first_name,
        lastName: f.last_name,
        username: f.username,
        profilePhoto: mediaUrl(req, f.profile_photo),
      })),
      reels: reels.rows.map((r) => ({
        id: r.id,
        thumbnail: mediaUrl(req, r.thumbnail_key || r.object_key),
        viewCount: r.view_count || 0,
      })),
      photos: photos.rows.map((r) => ({
        id: r.id,
        url: mediaUrl(req, r.object_key),
        thumbnail: mediaUrl(req, r.thumbnail_key || r.object_key),
      })),
      posts: posts.rows.map((r) => ({
        id: r.id,
        type: r.type,
        content: r.content,
        publishedAt: r.published_at,
        mediaUrl: mediaUrl(req, r.object_key),
        thumbnail: mediaUrl(req, r.thumbnail_key || r.object_key),
      })),
      suggestions: suggestions.rows.map((s) => ({
        userId: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        username: s.username,
        publicId: s.public_id,
        profileId: s.profile_id,
        profilePhoto: mediaUrl(req, s.profile_photo),
        currentCity: s.current_city,
        friendCount: s.friend_count || 0,
      })),
    };

    return res.json({ success: true, profile: result });
  } catch (error) {
    console.error("Profile request failed", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load this profile right now.",
    });
  }
}

router.get("/", authMiddleware, getProfile);
router.get("/:userId", authMiddleware, getProfile);

router.post(
  "/suggestions/:userId/add",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const viewerId = req.user.userId;
      const targetId = req.params.userId;
      const blocked = await pool.query(
        `SELECT 1 FROM blocked_users
         WHERE (user_id=$1 AND blocked_user_id=$2)
            OR (user_id=$2 AND blocked_user_id=$1)
         LIMIT 1`,
        [viewerId, targetId],
      );
      if (blocked.rowCount) {
        return res.status(409).json({
          success: false,
          reason: "You might not know this person, or one of you has blocked the other.",
        });
      }

      const existing = await pool.query(
        `SELECT 1 FROM friends
         WHERE (user_id=$1 AND friend_user_id=$2)
            OR (user_id=$2 AND friend_user_id=$1)
         LIMIT 1`,
        [viewerId, targetId],
      );
      if (existing.rowCount) {
        return res.json({
          success: false,
          reason: "You are already connected with this person.",
        });
      }

      const pending = await pool.query(
        `SELECT 1 FROM friend_requests
         WHERE ((sender_id=$1 AND receiver_id=$2)
            OR (sender_id=$2 AND receiver_id=$1))
           AND status='pending'
         LIMIT 1`,
        [viewerId, targetId],
      );
      if (pending.rowCount) {
        return res.json({
          success: false,
          reason: "A friend request between you is already pending.",
        });
      }

      return res.json({
        success: false,
        reason:
          "You might not know this person or you may be too far away to add them right now. ReDom limits some recommendations and connection requests for safety.",
      });
    } catch {
      return res.status(500).json({
        success: false,
        reason: "We couldn't send the request right now. Please try again.",
      });
    }
  },
);

export default router;
