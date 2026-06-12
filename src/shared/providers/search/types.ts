export const SEARCH_PROVIDER_IDS = [
  "tavily",
  "serper",
  "brave",
  "exa",
  "null",
] as const;

export type SearchProviderId = (typeof SEARCH_PROVIDER_IDS)[number];

export interface SearchQueryRequest {
  query: string;
  /** 风格市场可指定主题域偏好（如：fine-art / wikimedia / unsplash） */
  domainHint?: string;
  topK?: number;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface SearchQueryResult {
  items: SearchResultItem[];
  providerId: SearchProviderId;
}

/**
 * 网络搜索 Provider 抽象 (WEB_SEARCH 工具背后)。
 * Why: Tavily/Serper/Brave/Exa 各有特长，
 * 前端通过 toolDispatcher 透传 SearchQueryRequest 让后端做 Provider 路由。
 */
export interface SearchProvider {
  readonly id: SearchProviderId;
  query(request: SearchQueryRequest): Promise<SearchQueryResult>;
}
