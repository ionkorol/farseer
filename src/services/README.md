# Search Service

This directory contains the search service implementation for async background search processing.

## Overview

The search service provides asynchronous search request processing with database-backed status tracking. This allows:

- **Non-blocking searches**: Users get immediate response with a request ID
- **Background processing**: Searches continue even if the page is closed
- **Status tracking**: Real-time updates via long polling on the frontend
- **Persistence**: All search requests and results are stored in the database

## Architecture

### Database Schema

The system uses a `SearchRequest` table to track search status:

```prisma
model SearchRequest {
  id              String   @id @default(cuid())
  origin          String
  destination     String
  checkIn         DateTime
  checkOut        DateTime
  rooms           Int
  adultsPerRoom   String   // JSON array
  childrenPerRoom String   // JSON array
  childAges       String   // JSON array
  status          String   // "pending" | "in_progress" | "completed" | "failed"
  error           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  searchCacheId   String?  @unique
  searchCache     SearchCache?
}
```

### Search Flow

1. **User submits search form** → POST to `/results`
2. **Server creates SearchRequest** with status "pending"
3. **Server returns request ID** and redirects to `/results?requestId={id}`
4. **Background processing starts**:
   - Status changes to "in_progress"
   - VaxClient performs multi-vendor search
   - Results saved to SearchCache
   - SearchRequest linked to SearchCache
   - Status changes to "completed"
5. **Frontend polls for status** every 2 seconds using TanStack Query
6. **Results displayed** when status is "completed"

### Search Service API

#### `createSearchRequest(params)`

Creates a new search request and starts async processing.

**Parameters:**

```typescript
interface SearchRequestParams {
  origin: string;
  destination: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  rooms: number;
  adultsPerRoom: number[];
  childrenPerRoom: number[];
  childAges: number[][];
}
```

**Returns:** `Promise<string>` - Request ID

**Example:**

```typescript
const searchService = new SearchService();
const requestId = await searchService.createSearchRequest({
  origin: "ATL",
  destination: "LAS",
  checkIn: "2026-01-10",
  checkOut: "2026-01-17",
  rooms: 1,
  adultsPerRoom: [2],
  childrenPerRoom: [0],
  childAges: [],
});
// Returns: "clxyz123abc..."
```

#### `getSearchRequest(requestId)`

Get current status and results for a search request.

**Parameters:**

- `requestId: string` - The search request ID

**Returns:** `Promise<SearchRequestResponse | null>`

```typescript
interface SearchRequestResponse {
  requestId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  hotels?: VaxHotelResult[]; // Only when status is "completed"
  error?: string; // Only when status is "failed"
  createdAt: Date;
  updatedAt: Date;
}
```

**Example:**

```typescript
const status = await searchService.getSearchRequest("clxyz123abc");
if (status.status === "completed") {
  console.log(`Found ${status.hotels.length} hotels`);
}
```

## API Endpoints

### Create Search Request

```
GET /api/search?origin={origin}&destination={dest}&checkIn={date}&checkOut={date}&adults={n}
```

**Response:**

```json
{
  "requestId": "clxyz123abc..."
}
```

### Check Search Status

```
GET /api/search/{requestId}
```

**Response:**

```json
{
  "requestId": "clxyz123abc...",
  "status": "in_progress",
  "createdAt": "2025-12-29T06:13:55.000Z",
  "updatedAt": "2025-12-29T06:13:58.000Z"
}
```

When completed:

```json
{
  "requestId": "clxyz123abc...",
  "status": "completed",
  "hotels": [...],
  "createdAt": "2025-12-29T06:13:55.000Z",
  "updatedAt": "2025-12-29T06:14:12.000Z"
}
```

### View Results Page

```
GET /results?requestId={requestId}
```

Renders the HotelResultsPage component with client-side long polling.

## Frontend Integration

The frontend uses TanStack Query for long polling:

```typescript
const { data: searchRequest } = useQuery<SearchRequestResponse>({
  queryKey: ["search", requestId],
  queryFn: async () => {
    const response = await fetch(`/api/search/${requestId}`);
    return response.json();
  },
  refetchInterval: (query) => {
    const data = query.state.data;
    // Stop polling when completed or failed
    if (data?.status === "completed" || data?.status === "failed") {
      return false;
    }
    // Poll every 2 seconds while pending/in_progress
    return 2000;
  },
});
```

## Status States

### 1. Pending

Initial state when search request is created. Shows:

- "Search request queued..."
- Spinner animation
- Request ID for tracking

### 2. In Progress

Search is actively running. Shows:

- "Searching for hotels..."
- Spinner animation
- Request ID and current status

### 3. Completed

Search finished successfully. Shows:

- Full hotel results
- Filters and sorting controls
- Statistics (hotel count, avg price, etc.)

### 4. Failed

Search encountered an error. Shows:

- Error message
- "Try again" button to return to search form

## Error Handling

Errors during search processing are caught and stored in the `SearchRequest.error` field:

```typescript
try {
  // ... perform search ...
} catch (error) {
  await prisma.searchRequest.update({
    where: { id: requestId },
    data: {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    },
  });
}
```

## Performance Considerations

1. **Non-blocking**: Search creation returns immediately (< 50ms)
2. **Background processing**: CPU-intensive searches don't block the server
3. **Caching**: Results are cached in SearchCache, linked to SearchRequest
4. **Efficient polling**: Client-side polling stops when search completes
5. **Database indexes**: Status and createdAt fields are indexed for fast queries

## Usage Example

### Server-side (creating search)

```typescript
import { SearchService } from "./services/searchService.js";

const searchService = new SearchService();

// In route handler
const requestId = await searchService.createSearchRequest({
  origin: "ATL",
  destination: "LAS",
  checkIn: "2026-01-10",
  checkOut: "2026-01-17",
  rooms: 1,
  adultsPerRoom: [2],
  childrenPerRoom: [0],
  childAges: [],
});

// Redirect to results page
return Response.redirect(`/results?requestId=${requestId}`);
```

### Client-side (viewing results)

```tsx
import { HotelResultsClient } from "./components/HotelResultsClient.js";

// Component automatically polls for status
<HotelResultsClient
  requestId={requestId}
  filters={{ sortBy: "price", filterRating: 0, maxPrice: 10000 }}
/>;
```

## Future Enhancements

Potential improvements:

- WebSocket support for real-time updates instead of polling
- Progress tracking (e.g., "Searching vendor 2 of 5...")
- Search history dashboard
- Scheduled/recurring searches
- Email notifications when search completes
- Search request cancellation
- TTL-based cleanup of old search requests
