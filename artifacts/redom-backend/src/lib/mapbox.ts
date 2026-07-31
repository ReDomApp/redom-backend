import mbxGeocoding from "@mapbox/mapbox-sdk/services/geocoding";

const mapboxClient = mbxGeocoding({
  accessToken: process.env.MAPBOX_ACCESS_TOKEN!,
});

export async function geocodePlace(query: string) {
  const response = await mapboxClient
    .forwardGeocode({
      query,
      limit: 1,
    })
    .send();

  return response.body.features[0] ?? null;
}

export async function reverseGeocode(
  longitude: number,
  latitude: number,
) {
  const response = await mapboxClient
    .reverseGeocode({
      query: [longitude, latitude],
      limit: 1,
    })
    .send();

  return response.body.features[0] ?? null;
}