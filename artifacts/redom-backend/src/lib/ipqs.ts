import axios from "axios";

export interface IPQSResult {
  success: boolean;
  fraud_score: number;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  bot_status: boolean;
  country_code?: string;
}

export interface IPQSPhoneResult {
  success: boolean;
  fraud_score: number;
  VOIP?: boolean;
  active?: boolean;
  valid?: boolean;
  line_type?: string;
  carrier?: string;
  country_code?: string;
  country?: string;
  message?: string;
}

export async function checkIP(ip: string): Promise<IPQSResult> {
  const url = `https://ipqualityscore.com/api/json/ip/${process.env.IPQS_API_KEY}/${ip}`;
  const { data } = await axios.get<IPQSResult>(url);
  return data;
}

export async function checkPhone(phoneNumber: string): Promise<IPQSPhoneResult> {
  const url = `https://ipqualityscore.com/api/json/phone/${process.env.IPQS_API_KEY}/${encodeURIComponent(phoneNumber)}`;
  const { data } = await axios.get<IPQSPhoneResult>(url);
  return data;
}
