import { VaxClient } from "./clients/vax/vax.client.js";
import { SearchService } from "./services/searchService.js";
import index from "./index.html";

const vaxClient = new VaxClient();
const searchService = new SearchService();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const server = Bun.serve({
  port: PORT,
  routes: {
    "/*": index,
    "/api/vendors": async () => {
      const vendors = await vaxClient.listCachedVendors();

      return new Response(JSON.stringify(vendors), {
        headers: { "Content-Type": "application/json" },
      });
    },
    "/api/origins": async (req) => {
      try {
        const url = new URL(req.url);
        const vendorCode = url.searchParams.get("vendorCode") || "FJ1";
        const origins = await vaxClient.listCachedOriginMarkets(vendorCode);

        return new Response(JSON.stringify(origins), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
    "/api/destinations": async (req) => {
      try {
        const url = new URL(req.url);
        const vendorCode = url.searchParams.get("vendorCode") || "FJ1";

        const destinations = await vaxClient.listCachedDestinationMarkets(vendorCode);

        return new Response(JSON.stringify(destinations), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
    "/api/search": async (req) => {
      try {
        const url = new URL(req.url);
        const origin = url.searchParams.get("origin");
        if (!origin) throw new Error("Origin parameter is required");
        const destination = url.searchParams.get("destination");
        if (!destination) throw new Error("Destination parameter is required");
        const checkIn = url.searchParams.get("checkIn");
        if (!checkIn) throw new Error("checkIn parameter is required");
        const checkOut = url.searchParams.get("checkOut");
        if (!checkOut) throw new Error("checkOut parameter is required");
        const adults = Number(url.searchParams.get("adults")) || 2;

        console.log("[API] Creating search request:", {
          origin,
          destination,
          checkIn,
          checkOut,
          adults,
        });

        // Create async search request
        const requestId = await searchService.createSearchRequest({
          origin,
          destination,
          checkIn,
          checkOut,
          rooms: 1,
          adultsPerRoom: [adults],
          childrenPerRoom: [0],
          childAges: [],
        });

        return new Response(JSON.stringify({ requestId }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
    "/api/search/:requestId": async (req) => {
      try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split("/");
        const requestId = pathParts[pathParts.length - 1];

        if (!requestId) {
          return new Response(JSON.stringify({ error: "Request ID is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const searchRequest = await searchService.getSearchRequest(requestId);

        if (!searchRequest) {
          return new Response(JSON.stringify({ error: "Search request not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(searchRequest), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  },
  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at http://localhost:${server.port}`);
