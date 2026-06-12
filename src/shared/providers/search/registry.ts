import { nullSearchProvider } from "./null";
import { SEARCH_PROVIDER_IDS, type SearchProvider, type SearchProviderId } from "./types";

type EnvLike = Record<string, string | undefined>;

export const getSearchProvider = (env: EnvLike = process.env): SearchProvider => {
  const id = env.SEARCH_PROVIDER;
  if (!id || !(SEARCH_PROVIDER_IDS as readonly string[]).includes(id)) {
    return nullSearchProvider;
  }
  switch (id as SearchProviderId) {
    case "tavily":
    case "serper":
    case "brave":
    case "exa":
    case "null":
    default:
      return nullSearchProvider;
  }
};
