import { prisma } from "./db.js";
import type { VaxHotelResult, VaxSearchParams, VaxRoomOption } from "../clients/vax/vax.models.js";

/**
 * Generate a cache key from search params for database lookup
 * Format: origin_destination_checkIn_checkOut_rooms_adults
 * Example: ATL_LAS_2026-01-10_2026-01-17_1_2
 */
export function generateSearchCacheKey(params: Omit<VaxSearchParams, "vendor" | "packageType">): string {
  const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, "_");

  const parts = [
    sanitize(params.origin),
    sanitize(params.destination),
    params.checkIn,
    params.checkOut,
    params.rooms.toString(),
    params.adultsPerRoom.join("-"),
  ];

  // Add children info if present
  if (params.childrenPerRoom.some((count) => count > 0)) {
    parts.push(params.childrenPerRoom.join("-"));
    if (params.childAges.length > 0) {
      parts.push(params.childAges.map((ages) => ages.join("-")).join("_"));
    }
  }

  return parts.join("_");
}

/**
 * Get cached search results from database
 */
export async function getCachedSearchResults(
  params: Omit<VaxSearchParams, "vendor" | "packageType">
): Promise<VaxHotelResult[] | null> {
  try {
    const cacheKey = generateSearchCacheKey(params);

    const searchCache = await prisma.searchCache.findUnique({
      where: { cacheKey },
      include: {
        hotels: {
          include: {
            rooms: true,
          },
        },
      },
    });

    if (!searchCache) {
      return null;
    }

    // Convert database records back to VaxHotelResult format
    const hotels: VaxHotelResult[] = searchCache.hotels.map((hotel) => {
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
        rooms: hotel.rooms.map((room) => {
          const roomResult: VaxRoomOption = {
            code: room.code,
            name: room.name,
            totalPrice: room.totalPrice,
          };
          if (room.pricePerPerson !== null) {
            roomResult.pricePerPerson = room.pricePerPerson;
          }
          const parsedAddedValues = JSON.parse(room.addedValues) as string[];
          if (parsedAddedValues.length > 0) {
            roomResult.addedValues = parsedAddedValues;
          }
          const parsedValueIndicators = JSON.parse(room.valueIndicators) as string[];
          if (parsedValueIndicators.length > 0) {
            roomResult.valueIndicators = parsedValueIndicators;
          }
          return roomResult;
        }),
      };
      if (hotel.tripAdvisorRating !== null) {
        result.tripAdvisorRating = hotel.tripAdvisorRating;
      }
      if (hotel.tripAdvisorReviews !== null) {
        result.tripAdvisorReviews = hotel.tripAdvisorReviews;
      }
      if (hotel.distanceFromAirport !== null) {
        result.distanceFromAirport = hotel.distanceFromAirport;
      }
      if (hotel.cleaningBadge !== null) {
        result.cleaningBadge = hotel.cleaningBadge;
      }
      return result;
    });

    console.log(`✓ Found ${hotels.length} cached hotels for key: ${cacheKey}`);
    return hotels;
  } catch (error) {
    console.warn("Failed to retrieve cached search results:", error);
    return null;
  }
}

/**
 * Save search results to database
 */
export async function saveSearchResultsToCache(
  params: Omit<VaxSearchParams, "vendor" | "packageType">,
  hotels: VaxHotelResult[]
): Promise<void> {
  try {
    const cacheKey = generateSearchCacheKey(params);

    // Delete existing cache entry if present (will cascade delete hotels and rooms)
    await prisma.searchCache.deleteMany({
      where: { cacheKey },
    });

    // Create new cache entry with hotels and rooms
    await prisma.searchCache.create({
      data: {
        cacheKey,
        origin: params.origin,
        destination: params.destination,
        checkIn: new Date(params.checkIn),
        checkOut: new Date(params.checkOut),
        rooms: params.rooms,
        adultsPerRoom: JSON.stringify(params.adultsPerRoom),
        childrenPerRoom: JSON.stringify(params.childrenPerRoom),
        childAges: JSON.stringify(params.childAges),
        hotels: {
          create: hotels.map((hotel) => ({
            hotelId: hotel.hotelId,
            name: hotel.name,
            vendor: hotel.vendor,
            remoteSource: hotel.remoteSource,
            destinationCode: hotel.destinationCode,
            rating: hotel.rating,
            tripAdvisorRating: hotel.tripAdvisorRating ?? null,
            tripAdvisorReviews: hotel.tripAdvisorReviews ?? null,
            location: hotel.location,
            distanceFromAirport: hotel.distanceFromAirport ?? null,
            cleaningBadge: hotel.cleaningBadge ?? null,
            checkIn: new Date(hotel.checkIn),
            checkOut: new Date(hotel.checkOut),
            rooms: {
              create: hotel.rooms.map((room) => ({
                code: room.code,
                name: room.name,
                totalPrice: room.totalPrice,
                pricePerPerson: room.pricePerPerson ?? null,
                addedValues: JSON.stringify(room.addedValues ?? []),
                valueIndicators: JSON.stringify(room.valueIndicators ?? []),
              })),
            },
          })),
        },
      },
    });

    console.log(`✓ Saved ${hotels.length} hotels to cache with key: ${cacheKey}`);
  } catch (error) {
    console.error("Failed to save search results to cache:", error);
    throw error;
  }
}

/**
 * Clear old cache entries (older than specified days)
 */
export async function clearOldCacheEntries(olderThanDays: number = 7): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.searchCache.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`✓ Cleared ${result.count} old cache entries`);
    return result.count;
  } catch (error) {
    console.error("Failed to clear old cache entries:", error);
    return 0;
  }
}
