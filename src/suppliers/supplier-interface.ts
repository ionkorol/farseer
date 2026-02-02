import type { $Enums, Hotel, Room } from "@/db/index.js";

export interface ISupplierSearchParams {
  origin: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adultsPerRoom: number[];
  childrenPerRoom: number[];
  childAges: number[][];
}

export type ISupplierRoom = Omit<Room, "id" | "createdAt" | "updatedAt" | "hotelId">;

export type ISupplierHotel = Omit<Hotel, "id" | "createdAt" | "updatedAt" | "searchRequestId"> & {
  rooms: ISupplierRoom[];
};

export type ISupplierSearchResponse =
  | {
      success: true;
      hotels: ISupplierHotel[];
    }
  | {
      success: false;
      error: string;
    };

export interface ISupplierVendor {
  id: string;
  name: string;
}

export interface ISupplierMarket {
  id: string;
  name: string;
}

export interface ISupplierClient {
  readonly name: $Enums.Supplier;

  search(params: ISupplierSearchParams): Promise<ISupplierSearchResponse>;
  listVendors(): Promise<ISupplierVendor[]>;
  listOriginMarkets(): Promise<ISupplierMarket[]>;
  listDestinationMarkets(): Promise<ISupplierMarket[]>;
}
