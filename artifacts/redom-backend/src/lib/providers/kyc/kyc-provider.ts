export interface KycVerificationRequest {
  userId: string;

  documentType: string;

  countryCode?: string;

  firstName?: string;

  lastName?: string;

  dateOfBirth?: string;
}

export interface KycVerificationResult {
  providerReference:
    string;

  status:
    | "pending"
    | "approved"
    | "rejected";

  reason?: string;
}

export interface KycProvider {
  createVerification(
    request:
      KycVerificationRequest,
  ): Promise<KycVerificationResult>;

  getVerification(
    providerReference:
      string,
  ): Promise<KycVerificationResult>;
}