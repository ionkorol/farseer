---
name: api-builder
description: Converts cURL commands into TypeScript axios-based API client functions for Farseer travel
---

# API Builder Skill

This skill converts cURL commands into TypeScript axios-based API client functions for the Farseer travel deals application.

## Usage

When invoked, this skill:

1. Accepts one or more cURL commands as input
2. Parses the request details (method, headers, body, query parameters)
3. Generates a typed TypeScript function using axios
4. Creates or updates the appropriate API client file in `src/clients/`
5. Includes TypeScript interfaces for request/response types

## Input Format

Provide cURL commands in the standard format:

```bash
curl -X POST 'https://api.example.com/v1/search' \
  -H 'Authorization: Bearer ${API_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{
    "destination": "Paris",
    "checkin": "2024-01-15",
    "checkout": "2024-01-20"
  }'
```

## Output

The skill generates:

1. **TypeScript Interface** for request parameters
2. **TypeScript Interface** for response data
3. **Axios Function** with proper typing and error handling
4. **Environment Variable Placeholders** for API keys and secrets

### Example Output

```typescript
// src/clients/exampleApi.ts

import axios, { AxiosRequestConfig } from "axios";

interface SearchRequest {
  destination: string;
  checkin: string;
  checkout: string;
}

interface SearchResponse {
  deals: Deal[];
  total: number;
}

interface Deal {
  id: string;
  price: number;
  currency: string;
  // ... other fields
}

export async function searchDeals(params: SearchRequest, apiKey?: string): Promise<SearchResponse> {
  const config: AxiosRequestConfig = {
    method: "POST",
    url: "https://api.example.com/v1/search",
    headers: {
      Authorization: `Bearer ${apiKey || process.env.EXAMPLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    data: params,
  };

  const response = await axios.request<SearchResponse>(config);
  return response.data;
}
```

## Features

- Automatically extracts headers and converts them to axios config
- Identifies and parameterizes API keys/tokens for environment variables
- Parses JSON request bodies into TypeScript interfaces
- Generates query parameter handling for GET requests
- Includes basic error handling structure
- Uses proper TypeScript typing for type safety

## Environment Setup

After generating API clients, ensure:

1. Add the required API keys to your `.env` file
2. Update TypeScript response interfaces based on actual API responses
3. Add rate limiting if needed
4. Implement retry logic for production use

## Playwright Integration Note

While this skill focuses on API integration, for websites without APIs, use Playwright to:

1. Navigate to the website in headless mode
2. Interact with search forms and filters
3. Extract deal data from the DOM
4. Store scraped data in the same format as API responses

Playwright scrapers should be created in `src/scrapers/` directory.
