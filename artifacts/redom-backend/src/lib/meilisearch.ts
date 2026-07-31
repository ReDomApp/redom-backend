import { MeiliSearch } from "meilisearch";

export const meilisearch = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_MASTER_KEY!,
});