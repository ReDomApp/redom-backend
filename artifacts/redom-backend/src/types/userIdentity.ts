export interface UserIdentity {
  id: string;

  username: string;
  publicId: string;
  profileId: string;
}

export interface PublicProfileIdentity {
  username: string;

  /**
   * Present in publicly exposed profile URLs
   * only when the account permits public ID exposure.
   */
  publicId?: string;
}

export interface InternalUserIdentity {
  userId: string;
  profileId: string;
  sessionId?: string;
}