import type { SearchProvider, SearchQueryRequest, SearchQueryResult } from "./types";

const NOT_READY = new Error(
  "SEARCH_NOT_CONFIGURED: 未配置搜索 Provider，WEB_SEARCH 工具应在前端层降级为占位提示。",
);

export const nullSearchProvider: SearchProvider = {
  id: "null",
  async query(_request: SearchQueryRequest): Promise<SearchQueryResult> {
    void _request;
    throw NOT_READY;
  },
};
