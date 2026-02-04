import type { ISupplierSearchParams } from "@/suppliers/supplier-interface.js";
import { type $Enums, prisma, type Hotel, type Room } from "@/db/index.js";
import { createSupplierClient } from "@/suppliers/supplier-factory.js";
import { EventEmitter } from "node:events";

export interface SearchRequestResponse {
  requestId: string;
  status: $Enums.SearchRequestStatus;
  progress: string | null;
  hotels: (Hotel & {
    rooms: (Omit<Room, "totalPrice" | "pricePerPerson"> & {
      totalPrice: number;
      pricePerPerson: number | null;
    })[];
  })[];
  createdAt: string;
  updatedAt: string;
}
interface SearchEvents {
  [key: `search:${string}`]: [SearchRequestResponse];
}

export class SearchService {
  private emitter = new EventEmitter<SearchEvents>();

  public async createSearchRequest(params: ISupplierSearchParams): Promise<string> {
    const cacheKey = this.generateCacheKey(params);

    let searchRequest = await prisma.searchRequest.findFirst({
      where: {
        searchKey: cacheKey,
      },
    });

    if (searchRequest) {
      return searchRequest.id;
    }

    searchRequest = await prisma.searchRequest.create({
      data: {
        searchKey: cacheKey,
        origin: params.origin,
        destination: params.destination,
        checkIn: new Date(params.checkIn),
        checkOut: new Date(params.checkOut),
        rooms: params.rooms,
        adultsPerRoom: JSON.stringify(params.adultsPerRoom),
        childrenPerRoom: JSON.stringify(params.childrenPerRoom),
        childAges: JSON.stringify(params.childAges),
        status: "PENDING",
      },
    });

    console.log(`[SearchService] Created new search request: ${searchRequest.id}`);

    this.processSearch(searchRequest.id, params).catch((error) => {
      console.error(`Search request ${searchRequest.id} failed:`, error);
    });

    return searchRequest.id;
  }

  public async getSearchRequest(requestId: string): Promise<SearchRequestResponse> {
    const searchRequest = await prisma.searchRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        hotels: {
          include: {
            rooms: true,
          },
        },
      },
    });

    const response: SearchRequestResponse = {
      requestId: searchRequest.id,
      status: searchRequest.status,
      hotels: searchRequest.hotels.map((hotel) => ({
        ...hotel,
        rooms: hotel.rooms.map((room) => ({
          ...room,
          totalPrice: room.totalPrice.toNumber(),
          pricePerPerson: room.pricePerPerson?.toNumber() || null,
        })),
      })),
      progress: searchRequest.progress,
      createdAt: searchRequest.createdAt.toISOString(),
      updatedAt: searchRequest.updatedAt.toISOString(),
    };

    return response;
  }

  public addSearchUpdateListener(requestId: string, listener: (data: SearchRequestResponse) => void) {
    this.emitter.addListener(`search:${requestId}`, listener);
  }

  public removeAllSearchUpdateListeners(requestId: string) {
    this.emitter.removeAllListeners(`search:${requestId}`);
  }

  private async processSearch(requestId: string, params: ISupplierSearchParams): Promise<void> {
    try {
      const searchRequest = await prisma.searchRequest.update({
        where: { id: requestId },
        data: {
          status: "IN_PROGRESS",
          progress: "Initializing search...",
        },
      });

      const supplierClients = searchRequest.suppliers.map((name) => createSupplierClient(name));

      for (let i = 0; i < supplierClients.length; i++) {
        const supplierClient = supplierClients[i];
        if (!supplierClient) continue;

        await prisma.searchRequest.update({
          where: { id: requestId },
          data: {
            progress: `Searching supplier ${i + 1} of ${supplierClients.length}...`,
          },
        });

        this.emitter.emit(`search:${requestId}`, await this.getSearchRequest(requestId));

        const searchResponse = await supplierClient.search(params);
        if (!searchResponse.success) {
          throw new Error(`Supplier search failed: ${searchResponse.error}`);
        }

        await prisma.searchRequest.update({
          where: { id: requestId },
          data: {
            hotels: {
              createMany: {
                data: searchResponse.hotels,
                skipDuplicates: true,
              },
            },
          },
        });
      }

      await prisma.searchRequest.update({
        where: { id: requestId },
        data: {
          status: "COMPLETED",
          progress: "Search completed",
        },
      });

      console.log(`[SearchService] Search request ${requestId} marked as completed`);
    } catch (error) {
      console.error(`[SearchService] Search request ${requestId} failed:`, error);
      await prisma.searchRequest.update({
        where: { id: requestId },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.emitter.emit(`search:${requestId}`, await this.getSearchRequest(requestId));
    }
  }

  private generateCacheKey(params: ISupplierSearchParams): string {
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
