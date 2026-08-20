export interface EmailVerificationProvider {
  sendVerificationCode(params: {
    email: string;
    firstName: string;
    code: string;
  }): Promise<void>;

  sendPasswordResetCode(params: {
    email: string;
    firstName: string;
    code: string;
  }): Promise<void>;
}