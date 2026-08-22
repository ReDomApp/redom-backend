import type {
  VerificationRegion,
} from "../../config/verification-providers";

const COUNTRY_TO_REGION:
  Record<
    string,
    VerificationRegion
  > = {
    NG: "africa",
    ZA: "africa",
    GH: "africa",
    KE: "africa",
    EG: "africa",

    GB: "europe",
    DE: "europe",
    FR: "europe",
    ES: "europe",
    IT: "europe",
    NL: "europe",

    US: "north_america",
    CA: "north_america",
    MX: "north_america",

    IN: "asia",
    ID: "asia",
    PH: "asia",
    MY: "asia",
    SG: "asia",
    JP: "asia",
    KR: "asia",

    BR: "south_america",
    AR: "south_america",
    CL: "south_america",
    CO: "south_america",

    AU: "australia",
    NZ: "australia",
  };

export class RegionResolverService {
  resolve(
    countryCode: string,
  ): VerificationRegion {
    const normalized =
      countryCode
        .trim()
        .toUpperCase();

    const region =
      COUNTRY_TO_REGION[
        normalized
      ];

    if (!region) {
      throw new Error(
        `No verification provider region is configured for country: ${normalized}`,
      );
    }

    return region;
  }
}

export const regionResolverService =
  new RegionResolverService();