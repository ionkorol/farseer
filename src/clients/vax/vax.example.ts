import { AxiosError } from "axios";
import { VaxClient } from "./vax.client.js";
import type { VaxSearchParams } from "./vax.models.js";

const vaxClient = new VaxClient();

export async function vaxExample() {
  console.log();
  console.log("📝 Step 1: Authentication");
  console.log("-".repeat(60));

  const loginResponse = await vaxClient.login();

  if (!loginResponse.success) {
    console.error("✗ Login failed:", loginResponse.error);
    process.exit(1);
  }

  console.log("✓ Login successful!");

  console.log();
  console.log("🔍 Step 2: Search for Packages");
  console.log("-".repeat(60));

  // Create realistic search parameters
  const searchParams: Omit<VaxSearchParams, "vendor" | "packageType"> = {
    origin: "ATL",
    destination: "LAS",
    checkIn: "2025-12-30",
    checkOut: "2026-01-06",
    rooms: 1,
    adultsPerRoom: [2],
    childrenPerRoom: [0],
    childAges: [],
  };

  const searchResponse = await vaxClient.searchAllVendors(searchParams);

  if (!searchResponse.success) {
    console.error("✗ Search failed:", searchResponse.error);
    process.exit(1);
  }
  console.log("✓ Search successful!");

  console.log();
  console.log("📦 Step 3: Results");
  console.log("-".repeat(60));

  const hotels = searchResponse.hotels || [];

  if (hotels.length === 0) {
    console.log("No hotels found.");
  } else {
    console.log(`Found ${hotels.length} hotel(s)`);
    console.log(`  (Results automatically saved to src/clients/vax/search-results.json)`);
  }

  console.log();
  console.log("📊 Summary");
  console.log("-".repeat(60));
  console.log(`Total hotels found: ${hotels.length}`);

  if (hotels.length > 0) {
    const totalRooms = hotels.reduce((sum: number, hotel) => sum + hotel.rooms.length, 0);
    console.log(`Total room options: ${totalRooms}`);

    // Find cheapest and most expensive rooms
    const allRooms = hotels.flatMap((hotel) => hotel.rooms);
    if (allRooms.length > 0) {
      const prices = allRooms.map((room) => room.totalPrice);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      console.log(`Price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log("Example completed successfully!");
  console.log("=".repeat(60));
}

// Utility function to cache markets data - uncomment to use
// async function vaxSearchOrigin() {
//   await vaxClient.login();
//   await vaxClient.cacheMarketsToFile();
// }

if (import.meta.main) {
  vaxExample().catch((error) => {
    if (error instanceof AxiosError) {
      console.log(error.config?.headers);
      console.error("Axios error:", error.response?.data || error.message);
    } else {
      console.error("Fatal error:", error);
    }
    process.exit(1);
  });
}
