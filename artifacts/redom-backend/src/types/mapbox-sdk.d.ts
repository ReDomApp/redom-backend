declare module "@mapbox/mapbox-sdk/services/geocoding" {
  interface GeocodingFeature {
    [key: string]: unknown;
  }

  interface GeocodingResponse {
    body: {
      features: GeocodingFeature[];
    };
  }

  interface GeocodingClient {
    forwardGeocode(options: {
      query: string;
      limit: number;
    }): { send(): Promise<GeocodingResponse> };
    reverseGeocode(options: {
      query: [number, number];
      limit: number;
    }): { send(): Promise<GeocodingResponse> };
  }

  export default function mbxGeocoding(options: {
    accessToken: string;
  }): GeocodingClient;
}
