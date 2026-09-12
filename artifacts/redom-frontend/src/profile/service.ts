import { api } from "../api/client";

export type ProfileFriend = { userId:string; firstName:string; lastName:string; username:string; profilePhoto:string|null };
export type ProfileSuggestion = { userId:string; firstName:string; lastName:string; username:string; publicId:string; profileId:string; profilePhoto:string|null; currentCity:string|null; friendCount:number };
export type ProfileData = {
  userId:string; firstName:string; lastName:string; username:string; publicId:string; profileId:string|null;
  profilePhoto:string|null; coverPhoto:string|null; friendCount:number; followerCount:number; postCount:number;
  location:string|null; birthday:string|null; joinedAt:string|null; joinedCountry:string; verified:boolean; isOwner:boolean;
  friends:ProfileFriend[]; reels:Array<{id:string;thumbnail:string|null;viewCount:number}>;
  photos:Array<{id:string;url:string|null;thumbnail:string|null}>;
  posts:Array<{id:string;type:string;content:string|null;publishedAt:string;mediaUrl:string|null;thumbnail:string|null}>;
  suggestions:ProfileSuggestion[];
};

export const profileService = {
  async getProfile(userId?:string) {
    const suffix = userId ? `/${encodeURIComponent(userId)}` : "";
    return api.get<{success:boolean;profile:ProfileData}>(`/profile${suffix}`);
  },
  async addSuggestion(userId:string) {
    return api.post<{success:boolean;reason?:string}>(`/profile/suggestions/${encodeURIComponent(userId)}/add`, {});
  },
};
