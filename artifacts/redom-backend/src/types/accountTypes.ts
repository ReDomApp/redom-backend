import type { AccountStatus } from "./userStatusEnums";
import type { Gender } from "./genderEnums";
import type { ProfileIdVisibility } from "./userStatusEnums";

export interface AccountIdentity {
  id: string;

  username: string;
  publicId: string;
  profileId: string;

  firstName: string;
  lastName: string;

  email: string | null;
  phoneNumber: string | null;

  dateOfBirth: string | null;
  gender: Gender | null;

  profileIdVisibility: ProfileIdVisibility;

  emailVerified: boolean;
  phoneVerified: boolean;

  accountStatus: AccountStatus;

  createdAt: Date;
  updatedAt: Date;
}

export interface AccountContactMethods {
  email: string | null;
  phoneNumber: string | null;
}

export interface AccountVerificationState {
  emailVerified: boolean;
  phoneVerified: boolean;
}