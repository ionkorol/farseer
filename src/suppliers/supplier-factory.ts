import type { $Enums } from "@/db/index.js";
import { VaxClient } from "./vax/vax.client.js";
import type { ISupplierClient } from "./supplier-interface.js";

export function createSupplierClient(clientName: $Enums.Supplier): ISupplierClient {
  switch (clientName) {
    case "VAX":
      return new VaxClient();
    default:
      throw new Error(`Unknown client: ${clientName}`);
  }
}
