import { SearchService, type SearchRequestResponse } from "@/services/search-service.js";
import index from "./index.html";
import { VendorService } from "./services/vendor-service.js";
import { MarketService } from "./services/market-service.js";

const searchService = new SearchService();
const vendorService = new VendorService();
const marketService = new MarketService();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const server = Bun.serve({
  port: PORT,
  routes: {
    "/*": index,
    "/api/vendors": async () => {
      const vendors = await vendorService.listVendors();

      return new Response(JSON.stringify(vendors), {
        headers: { "Content-Type": "application/json" },
      });
    },
    "/api/origins": async () => {
      try {
        const origins = await marketService.listOriginMarkets();

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
    "/api/destinations": async () => {
      try {
        const destinations = await marketService.listDestinationMarkets();

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
    "/api/search/:requestId/stream": async (req) => {
      try {
        const requestId = req.params.requestId;
        const searchRequest = await searchService.getSearchRequest(requestId);

        const stream = new ReadableStream({
          start(controller) {
            const sendEvent = (data: SearchRequestResponse) => {
              controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
            };

            sendEvent(searchRequest);

            searchService.addSearchUpdateListener(requestId, (data) => {
              sendEvent(data);

              if (data.status === "COMPLETED" || data.status === "FAILED") {
                controller.close();
              }
            });

            if (searchRequest.status === "COMPLETED" || searchRequest.status === "FAILED") {
              searchService.removeAllSearchUpdateListeners(requestId);
              controller.close();
            }
          },
          cancel() {
            searchService.removeAllSearchUpdateListeners(requestId);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
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
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at http://localhost:${server.port}`);
