import { prisma } from "../lib/db.js";

/**
 * Debug script to check search request status
 * Usage: bun src/debug/checkSearchStatus.ts <requestId>
 */

const requestId = process.argv[2];

if (!requestId) {
  console.error("Usage: bun src/debug/checkSearchStatus.ts <requestId>");
  process.exit(1);
}

async function checkStatus() {
  if (!requestId) {
    console.error("Request ID is required");
    process.exit(1);
  }

  const searchRequest = await prisma.searchRequest.findUnique({
    where: { id: requestId },
    include: {
      searchCache: {
        include: {
          hotels: true,
        },
      },
    },
  });

  if (!searchRequest) {
    console.error(`Search request ${requestId} not found`);
    process.exit(1);
  }

  console.log("\n=== Search Request Status ===");
  console.log(`ID: ${searchRequest.id}`);
  console.log(`Status: ${searchRequest.status}`);
  console.log(`Progress: ${searchRequest.progress || "N/A"}`);
  console.log(`Error: ${searchRequest.error || "N/A"}`);
  console.log(`Created: ${searchRequest.createdAt.toISOString()}`);
  console.log(`Updated: ${searchRequest.updatedAt.toISOString()}`);
  console.log(`\nSearch Parameters:`);
  console.log(`  Origin: ${searchRequest.origin}`);
  console.log(`  Destination: ${searchRequest.destination}`);
  console.log(`  Check-in: ${searchRequest.checkIn.toISOString().split("T")[0]}`);
  console.log(`  Check-out: ${searchRequest.checkOut.toISOString().split("T")[0]}`);
  console.log(`  Rooms: ${searchRequest.rooms}`);
  console.log(`  Adults: ${JSON.parse(searchRequest.adultsPerRoom)}`);

  if (searchRequest.searchCache) {
    console.log(`\n=== Results ===`);
    console.log(`Hotels found: ${searchRequest.searchCache.hotels.length}`);
    console.log(`Cache key: ${searchRequest.searchCache.cacheKey}`);
  } else if (searchRequest.status === "completed") {
    console.log(`\n⚠️  Status is completed but no SearchCache found!`);
  }

  await prisma.$disconnect();
}

checkStatus().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
