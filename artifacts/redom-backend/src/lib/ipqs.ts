import axios from "axios";

export interface IPQSResult {
  success: boolean;
  fraud_score: number;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  bot_status: boolean;
}

export async function checkIP(
  ip: string,
): Promise<IPQSResult> {
  const url = `https://ipqualityscore.com/api/json/ip/${process.env.IPQS_API_KEY}/${ip}`;

  const { data } = await axios.get<IPQSResult>(url);

  return data;
}