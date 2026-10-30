export type VeriphoneResult = {
  status?: string;
  phone_valid?: boolean;
  phone_type?: string;
  carrier?: string;
  country_code?: string;
  e164?: string;
  international_number?: string;
  current_carrier?: string;
  current_line_type?: string;
};

export class VeriphoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VeriphoneError";
  }
}

export async function verifyAurelinkNumber(phone: string): Promise<VeriphoneResult> {
  const key = process.env.VERIPHONE_API_KEY?.trim();
  if (!key) throw new VeriphoneError("Veriphone is not configured. Number verification is unavailable.");

  const url = new URL("https://api.veriphone.io/v3/verify");
  url.searchParams.set("phone", phone);
  url.searchParams.set("mode", "static");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      signal: controller.signal,
    });
    const data = await response.json() as VeriphoneResult;
    if (!response.ok || data.status !== "success") {
      throw new VeriphoneError("Veriphone could not verify this phone number.");
    }
    return data;
  } catch (error) {
    if (error instanceof VeriphoneError) throw error;
    throw new VeriphoneError(error instanceof Error && error.name === "AbortError"
      ? "Veriphone verification timed out."
      : "Veriphone verification could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

/** Reports the provider's classification without imposing a global mobile-only rule. */
export function veriphoneLineAssessment(result: VeriphoneResult): {
  valid: boolean;
  lineType: string;
  carrier: string;
} {
  const lineType = String(result.current_line_type || result.phone_type || "").trim().toLowerCase();
  return {
    valid: result.status === "success" && result.phone_valid === true,
    lineType: lineType || "unknown",
    carrier: String(result.current_carrier || result.carrier || "Unknown carrier"),
  };
}
