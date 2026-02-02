import type { ISupplierMarket } from "@/suppliers/supplier-interface.js";
import path from "path";

export class MarketService {
  async listOriginMarkets(): Promise<ISupplierMarket[]> {
    const file = Bun.file(path.join(import.meta.dir, "origin-markets.json"));
    const content = await file.text();
    const records = JSON.parse(content) as Record<string, { code: string; description: string }[]>;
    const markets = new Map<string, ISupplierMarket>();
    for (const marketList of Object.values(records)) {
      for (const record of marketList) {
        markets.set(record.code, {
          id: record.code,
          name: record.description,
        });
      }
    }

    return Array.from(markets.values());
  }

  async listDestinationMarkets(): Promise<ISupplierMarket[]> {
    const file = Bun.file(path.join(import.meta.dir, "destination-markets.json"));
    const content = await file.text();
    const records = JSON.parse(content) as Record<string, { code: string; description: string }[]>;
    const markets = new Map<string, ISupplierMarket>();
    for (const marketList of Object.values(records)) {
      for (const record of marketList) {
        markets.set(record.code, {
          id: record.code,
          name: record.description,
        });
      }
    }

    return Array.from(markets.values());
  }
}
