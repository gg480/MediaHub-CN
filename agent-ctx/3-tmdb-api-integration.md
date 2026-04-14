# Task 3 - TMDB API Integration Agent

## Task
Implement Real TMDB API Integration

## Work Completed

### 1. Rewrote `/api/scrape/search/route.ts` as comprehensive TMDB proxy
- Multi-search (`GET /api/scrape/search?q=xxx`) - searches both movies and TV shows
- Movie details (`GET /api/scrape/search?tmdbId=123&mediaType=movie`) - with credits and videos
- TV details (`GET /api/scrape/search?tmdbId=123&mediaType=tv`) - with seasons, episodes, credits, videos
- Language support (zh-CN default, en-US via param)
- API key from DB Settings (`tmdb_api_key`) or env var (`TMDB_API_KEY`)
- Proxy support from DB Settings (`proxy_host`)
- 10-second timeout protection
- All Chinese error messages
- Removes mock data fallback - now returns error if no API key configured

### 2. Created `/api/scrape/tmdb/route.ts` for trending/popular endpoints
- `GET /api/scrape/tmdb?trending=movie` - Weekly trending movies
- `GET /api/scrape/tmdb?trending=tv` - Weekly trending TV shows
- `GET /api/scrape/tmdb?popular=movie` - Popular movies
- `GET /api/scrape/tmdb?popular=tv` - Popular TV shows
- Unified response format with `label` field for Chinese section names
- Same proxy/timeout support as search route

### 3. Updated Discover page (`/src/components/discover.tsx`)
- Shows 4 horizontal scrollable sections on load: trending movies, trending TV, popular movies, popular TV
- Search mode with filter buttons (all/movie/tv)
- "返回" button to return from search to browse mode
- Independent loading skeletons and error retry per section
- TrendingUp and Flame icons for visual distinction
- Fixed react-hooks lint errors (immutability, refs)

### Lint Status
- All 3 modified files pass lint
- Pre-existing lint errors in downloads.tsx, library.tsx, subscribe.tsx (not in scope)
