import { RegistrationFlowReservationService } from "./registration-flow-reservation.service";

declare module "./registration-flow-reservation.service" {
  interface RegistrationFlowReservationService {
    consume(reservationId: string, flowId: string, deviceId?: string): Promise<{
      id: string;
      flowId: string;
      firstName: string | null;
      lastName: string | null;
      dateOfBirth: string | null;
      expiresAt: Date;
    }>;
  }
}
