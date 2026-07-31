import axios from "axios";

export async function verifyTurnstileToken(
  token: string,
): Promise<boolean> {
  const response = await axios.post(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY!,
      response: token,
    }),
  );

  return response.data.success === true;
}