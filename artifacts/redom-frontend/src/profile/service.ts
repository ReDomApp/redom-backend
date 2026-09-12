import { api } from "../api/client";
import { env } from "../config/env";

export type ProfileFriend = { userId:string; firstName:string; lastName:string; username:string; profilePhoto:string|null };
export type ProfileSuggestion = { userId:string; firstName:string; lastName:string; username:string; publicId:string; profileId:string; profilePhoto:string|null; currentCity:string|null; friendCount:number };
export type ProfileData = {
  userId:string; firstName:string; lastName:string; username:string; publicId:string; profileId:string|null;
  shareCode:string; shareUrl:string;
  profilePhoto:string|null; coverPhoto:string|null; friendCount:number; followerCount:number; postCount:number;
  bio:string|null; location:string|null; hometown:string|null; birthday:string|null; joinedAt:string|null; joinedCountry:string; verified:boolean; isOwner:boolean;
  friends:ProfileFriend[]; reels:Array<{id:string;thumbnail:string|null;viewCount:number}>;
  photos:Array<{id:string;url:string|null;thumbnail:string|null}>;
  posts:Array<{id:string;type:string;content:string|null;publishedAt:string;mediaUrl:string|null;thumbnail:string|null}>;
  suggestions:ProfileSuggestion[];
};

const mediaUri = (value: string|null|undefined) => {
  if (!value) return null;
  if (value === "__redom_default__") return `${env.apiBaseUrl}/profile/media/default.svg`;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("profiles/")) return `${env.apiBaseUrl}/profile/media/file/${value.split("/").map(encodeURIComponent).join("/")}`;
  return value;
};

function normalize(profile: ProfileData): ProfileData {
  return {
    ...profile,
    profilePhoto: mediaUri(profile.profilePhoto),
    coverPhoto: mediaUri(profile.coverPhoto),
    friends: profile.friends.map(friend => ({ ...friend, profilePhoto: mediaUri(friend.profilePhoto) })),
    suggestions: profile.suggestions.map(suggestion => ({ ...suggestion, profilePhoto: mediaUri(suggestion.profilePhoto) })),
    reels: profile.reels.map(reel => ({ ...reel, thumbnail: mediaUri(reel.thumbnail) })),
    photos: profile.photos.map(photo => ({ ...photo, url: mediaUri(photo.url), thumbnail: mediaUri(photo.thumbnail) })),
    posts: profile.posts.map(post => ({ ...post, mediaUrl: mediaUri(post.mediaUrl), thumbnail: mediaUri(post.thumbnail) })),
  };
}

export const profileService = {
  async getProfile(userId?:string) {
    const suffix = userId ? `/${encodeURIComponent(userId)}` : "";
    const result = await api.get<{success:boolean;profile:ProfileData}>(`/profile${suffix}`);
    return { ...result, profile: normalize(result.profile) };
  },
  async addSuggestion(userId:string) {
    return api.post<{success:boolean;reason?:string}>(`/profile/suggestions/${encodeURIComponent(userId)}/add`, {});
  },
};
