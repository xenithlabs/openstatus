import { createSearchParamsCache, parseAsString } from "nuqs/server";

export const searchParamsParsers = {
  year: parseAsString.withDefault(String(new Date().getFullYear())),
};

export const searchParamsCache = createSearchParamsCache(searchParamsParsers);
