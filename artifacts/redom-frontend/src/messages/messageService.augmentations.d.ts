import "./messageService";
declare module "./messageService" {
  interface ReDomMessage {
    isForwarded?: boolean;
    forwardedFromMessageId?: string | null;
    forwardedMany?: boolean;
  }
}
export {};
