import { prisma } from "../lib/db.js";
import { VaxClient } from "../clients/vax/vax.client.js";
import type { VaxHotelResult } from "../clients/vax/vax.models.js";

export type SearchStatus = "pending" | "in_progress" | "completed" | "failed";

export interface SearchRequestParams {
  origin: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adultsPerRoom: number[];
  childrenPerRoom: number[];
  childAges: number[][];
}

export interface SearchRequestResponse {
  requestId: string;
  status: SearchStatus;
  progress?: string;
  hotels?: VaxHotelResult[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Search Service
 * Handles async search processing with database-backed status tracking
 */
export class SearchService {
  private vaxClient: VaxClient;

  constructor() {
    this.vaxClient = new VaxClient();
  }

  /**
   * Create a new search request and process it asynchronously
   * Returns the request ID immediately for status polling
   * If a search with the same parameters already exists, returns that request ID
   */
  async createSearchRequest(params: SearchRequestParams): Promise<string> {
    // Generate cache key to check for existing search
    const cacheKey = this.generateCacheKey(params);

    // Check if a SearchCache already exists for these parameters
    const existingCache = await prisma.searchCache.findUnique({
      where: { cacheKey },
      include: {
        searchRequest: true,
      },
    });

    // If we found an existing cache with a search request, return that request ID
    if (existingCache?.searchRequest) {
      console.log(`[SearchService] Found existing search request: ${existingCache.searchRequest.id}`);
      return existingCache.searchRequest.id;
    }

    // No existing search found, create a new pending search request
    const searchRequest = await prisma.searchRequest.create({
      data: {
        origin: params.origin,
        destination: params.destination,
        checkIn: new Date(params.checkIn),
        checkOut: new Date(params.checkOut),
        rooms: params.rooms,
        adultsPerRoom: JSON.stringify(params.adultsPerRoom),
        childrenPerRoom: JSON.stringify(params.childrenPerRoom),
        childAges: JSON.stringify(params.childAges),
        status: "pending",
      },
    });

    console.log(`[SearchService] Created new search request: ${searchRequest.id}`);

    // Process search asynchronously (non-blocking)
    this.processSearch(searchRequest.id, params).catch((error) => {
      console.error(`Search request ${searchRequest.id} failed:`, error);
    });

    return searchRequest.id;
  }

  /**
   * Process search asynchronously
   * Updates database status as it progresses
   */
  private async processSearch(requestId: string, params: SearchRequestParams): Promise<void> {
    try {
      // Update status to in_progress
      await prisma.searchRequest.update({
        where: { id: requestId },
        data: {
          status: "in_progress",
          progress: "Initializing search...",
        },
      });

      console.log(`[SearchService] Starting search for request ${requestId}`);
      console.log(`[SearchService] Search params:`, JSON.stringify(params, null, 2));

      // Update progress
      await prisma.searchRequest.update({
        where: { id: requestId },
        data: { progress: "Searching all vendors..." },
      });

      // Perform the actual search with timeout protection
      const searchPromise = this.vaxClient.searchAllVendors({
        origin: params.origin,
        destination: params.destination,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        rooms: params.rooms,
        adultsPerRoom: params.adultsPerRoom,
        childrenPerRoom: params.childrenPerRoom,
        childAges: params.childAges,
      });

      // Add timeout (5 minutes)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Search timeout after 5 minutes")), 5 * 60 * 1000);
      });

      const response = await Promise.race([searchPromise, timeoutPromise]);

      if (!response.success) {
        throw new Error(response.error || "Search failed");
      }

      console.log(`[SearchService] Search completed for request ${requestId}: ${response.hotels.length} hotels found`);

      // Find the SearchCache entry that was created by searchAllVendors
      const cacheKey = this.generateCacheKey(params);
      const searchCache = await prisma.searchCache.findUnique({
        where: { cacheKey },
      });

      // Update search request to completed and link to cache
      const updateData: { status: string; searchCacheId?: string } = {
        status: "completed",
      };

      if (searchCache) {
        updateData.searchCacheId = searchCache.id;
      } else {
        console.warn(`[SearchService] SearchCache not found for key ${cacheKey}`);
      }

      await prisma.searchRequest.update({
        where: { id: requestId },
        data: updateData,
      });

      console.log(`[SearchService] Search request ${requestId} marked as completed`);
    } catch (error) {
      console.error(`[SearchService] Search request ${requestId} failed:`, error);

      // Update search request to failed with error message
      await prisma.searchRequest.update({
        where: { id: requestId },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Get search request status and results
   */
  async getSearchRequest(requestId: string): Promise<SearchRequestResponse | null> {
    const searchRequest = await prisma.searchRequest.findUnique({
      where: { id: requestId },
      include: {
        searchCache: {
          include: {
            hotels: {
              include: {
                rooms: true,
              },
            },
          },
        },
      },
    });

    if (!searchRequest) {
      return null;
    }

    const response: SearchRequestResponse = {
      requestId: searchRequest.id,
      status: searchRequest.status as SearchStatus,
      createdAt: searchRequest.createdAt,
      updatedAt: searchRequest.updatedAt,
    };

    if (searchRequest.progress) {
      response.progress = searchRequest.progress;
    }

    if (searchRequest.error) {
      response.error = searchRequest.error;
    }

    // Convert database records to VaxHotelResult format if completed
    if (searchRequest.status === "completed" && searchRequest.searchCache) {
      response.hotels = searchRequest.searchCache.hotels.map((hotel) => {
        const result: VaxHotelResult = {
          hotelId: hotel.hotelId,
          name: hotel.name,
          rating: hotel.rating,
          location: hotel.location,
          vendor: hotel.vendor,
          remoteSource: hotel.remoteSource,
          destinationCode: hotel.destinationCode,
          checkIn: hotel.checkIn.toISOString().split("T")[0]!,
          checkOut: hotel.checkOut.toISOString().split("T")[0]!,
          rooms: hotel.rooms.map((room) => ({
            code: room.code,
            name: room.name,
            totalPrice: room.totalPrice,
            ...(room.pricePerPerson !== null && { pricePerPerson: room.pricePerPerson }),
            ...(JSON.parse(room.addedValues).length > 0 && {
              addedValues: JSON.parse(room.addedValues) as string[],
            }),
            ...(JSON.parse(room.valueIndicators).length > 0 && {
              valueIndicators: JSON.parse(room.valueIndicators) as string[],
            }),
          })),
          ...(hotel.tripAdvisorRating !== null && { tripAdvisorRating: hotel.tripAdvisorRating }),
          ...(hotel.tripAdvisorReviews !== null && { tripAdvisorReviews: hotel.tripAdvisorReviews }),
          ...(hotel.distanceFromAirport !== null && { distanceFromAirport: hotel.distanceFromAirport }),
          ...(hotel.cleaningBadge !== null && { cleaningBadge: hotel.cleaningBadge }),
        };
        return result;
      });
    }

    return response;
  }

  /**
   * Generate cache key for search params (matches searchCache.ts logic)
   */
  private generateCacheKey(params: SearchRequestParams): string {
    const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, "_");

    const parts = [
      sanitize(params.origin),
      sanitize(params.destination),
      params.checkIn,
      params.checkOut,
      params.rooms.toString(),
      params.adultsPerRoom.join("-"),
    ];

    if (params.childrenPerRoom.some((count) => count > 0)) {
      parts.push(params.childrenPerRoom.join("-"));
      if (params.childAges.length > 0) {
        parts.push(params.childAges.map((ages) => ages.join("-")).join("_"));
      }
    }

    return parts.join("_");
  }
}
