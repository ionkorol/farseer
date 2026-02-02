import type { ISupplierVendor } from "@/suppliers/supplier-interface.js";
import path from "path";

export class VendorService {
  async listVendors(): Promise<ISupplierVendor[]> {
    const file = Bun.file(path.join(import.meta.dir, "vendors.json"));
    const content = await file.text();
    const records = JSON.parse(content) as Array<{ code: string; name: string }>;

    return records.map((record) => ({
      id: record.code,
      name: record.name,
    }));
  }
}
