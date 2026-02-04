import { useState, useEffect } from "react";
import type { SearchRequestResponse } from "../services/search-service.js";
import "./HotelResults.css";

export function HotelResults() {
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get("requestId");

  const [sortBy, setSortBy] = useState<"price" | "priceDesc" | "rating" | "name" | "tripadvisor">("price");
  const [filterRating, setFilterRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState(Infinity);

  const [searchRequest, setSearchRequest] = useState<SearchRequestResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!requestId) return;

    const eventSource = new EventSource(`/api/search/${requestId}/stream`);

    const listener = (event: MessageEvent) => {
      const data = JSON.parse(event.data) as SearchRequestResponse;
      setSearchRequest(data);
      if (data.status === "COMPLETED" || data.status === "FAILED") {
        eventSource.close();
        setIsLoading(false);
      }
    };

    eventSource.addEventListener("open", () => {
      console.log("Connected to search updates stream");
    });
    eventSource.addEventListener("message", listener);
    eventSource.addEventListener("error", (err) => {
      console.error("Error in search updates stream", err);
      setError(new Error("An error occurred while receiving search updates"));
      setIsLoading(false);
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, [requestId]);

  // Calculate prices for useEffect (safe to run even when no data)
  const hotels = searchRequest?.hotels || [];
  const allRooms = hotels.flatMap((hotel) => hotel.rooms.map((room) => ({ ...room, hotelName: hotel.name })));
  const prices = allRooms.map((r) => r.totalPrice);
  const maxPriceOverall = prices.length > 0 ? Math.max(...prices) : 10000;

  // Initialize maxPrice filter to the actual max price when data loads
  useEffect(() => {
    if (maxPrice === Infinity && maxPriceOverall > 0) {
      setMaxPrice(maxPriceOverall);
    }
  }, [maxPriceOverall, maxPrice]);

  if (!requestId) {
    return (
      <div className="container">
        <div className="error-state">
          <h2>Request ID is missing</h2>
          <p>Please provide a valid requestId in the URL parameters.</p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading || !searchRequest) {
    return (
      <div className="container">
        <div className="loading-state">
          <div className="spinner"></div>
          <h2>Initializing search...</h2>
          <p>Please wait while we prepare your request</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="container">
        <div className="error-state">
          <h2>Error loading search results</h2>
          <p>{error instanceof Error ? error.message : "An unknown error occurred"}</p>
        </div>
      </div>
    );
  }

  // Show pending/in_progress state
  if (searchRequest.status === "PENDING" || searchRequest.status === "IN_PROGRESS") {
    return (
      <div className="container">
        <div className="loading-state">
          <div className="spinner"></div>
          <h2>{searchRequest.status === "PENDING" ? "Search request queued..." : "Searching for hotels..."}</h2>
          {searchRequest.progress && <p className="progress-message">{searchRequest.progress}</p>}
          <p>This may take a few moments. Feel free to close this page - your search will continue in the background.</p>
          <div className="status-info">
            <p>Request ID: {requestId}</p>
            <p>Status: {searchRequest.status}</p>
            <p>Last updated: {new Date(searchRequest.updatedAt).toLocaleTimeString()}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show failed state
  if (searchRequest.status === "FAILED") {
    return (
      <div className="container">
        <div className="error-state">
          <h2>Search failed</h2>
          <p>An error occurred during the search</p>
          <button onClick={() => (window.location.href = "/")}>Try again</button>
        </div>
      </div>
    );
  }

  // Apply filters and sorting (we have hotels, allRooms, prices, maxPriceOverall from above)
  const minPriceOverall = prices.length > 0 ? Math.min(...prices) : 0;

  const filteredAndSorted = hotels
    .filter((hotel) => hotel.rating >= filterRating)
    .filter((hotel) => {
      const minRoomPrice = Math.min(...hotel.rooms.map((r) => r.totalPrice));
      return minRoomPrice <= maxPrice;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "price": {
          const minA = Math.min(...a.rooms.map((r) => r.totalPrice));
          const minB = Math.min(...b.rooms.map((r) => r.totalPrice));
          return minA - minB;
        }
        case "priceDesc": {
          const minA = Math.min(...a.rooms.map((r) => r.totalPrice));
          const minB = Math.min(...b.rooms.map((r) => r.totalPrice));
          return minB - minA;
        }
        case "rating":
          return b.rating - a.rating;
        case "name":
          return a.name.localeCompare(b.name);
        case "tripadvisor":
          return (b.tripAdvisorRating || 0) - (a.tripAdvisorRating || 0);
        default:
          return 0;
      }
    });

  const totalRooms = filteredAndSorted.reduce((sum, hotel) => sum + hotel.rooms.length, 0);
  const avgPrice = allRooms.length > 0 ? allRooms.reduce((sum, r) => sum + r.totalPrice, 0) / allRooms.length : 0;

  return (
    <div className="container">
      <header>
        <h1>VAX Hotel Search Results</h1>
        <p className="subtitle">Search completed</p>
      </header>

      <div className="controls">
        <div className="control-group">
          <label htmlFor="sort">Sort by:</label>
          <select id="sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="price">Price (Low to High)</option>
            <option value="priceDesc">Price (High to Low)</option>
            <option value="rating">Star Rating</option>
            <option value="name">Hotel Name</option>
            <option value="tripadvisor">TripAdvisor Rating</option>
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="rating">Minimum Rating:</label>
          <select id="rating" value={filterRating} onChange={(e) => setFilterRating(Number(e.target.value))}>
            <option value="0">All Hotels</option>
            <option value="5">5 Stars</option>
            <option value="4">4+ Stars</option>
            <option value="3">3+ Stars</option>
            <option value="2">2+ Stars</option>
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="price">Max Price: ${maxPrice.toFixed(2)}</label>
          <input
            type="range"
            id="price"
            min={minPriceOverall}
            max={maxPriceOverall}
            step="10"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{filteredAndSorted.length}</div>
          <div className="stat-label">Hotels Found</div>
        </div>
        <div className="stat">
          <div className="stat-value">{totalRooms}</div>
          <div className="stat-label">Room Options</div>
        </div>
        <div className="stat">
          <div className="stat-value">${avgPrice.toFixed(2)}</div>
          <div className="stat-label">Average Price</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            ${minPriceOverall.toFixed(2)} - ${maxPriceOverall.toFixed(2)}
          </div>
          <div className="stat-label">Price Range</div>
        </div>
      </div>

      <div className="hotels-grid">
        {!filteredAndSorted.length && (
          <div className="no-results">
            <h2>No hotels match your filters</h2>
            <p>Try adjusting your search criteria</p>
          </div>
        )}
        {filteredAndSorted.map((hotel) => (
          <div key={hotel.id} className="hotel-card">
            <div className="hotel-header">
              <h2 className="hotel-name">{hotel.name}</h2>

              <div className="hotel-meta">
                <span className="stars">
                  {"★".repeat(Math.min(5, Math.max(0, hotel.rating)))}
                  {"☆".repeat(Math.max(0, 5 - hotel.rating))}
                </span>

                {hotel.tripAdvisorRating && (
                  <span className="tripadvisor">
                    TripAdvisor: {hotel.tripAdvisorRating.toFixed(1)}/5
                    {hotel.tripAdvisorReviews && ` (${hotel.tripAdvisorReviews.toLocaleString()} reviews)`}
                  </span>
                )}

                <span className="location">
                  {hotel.location}
                  {hotel.distanceFromAirport && ` • ${hotel.distanceFromAirport} mi from airport`}
                </span>

                {hotel.cleaningBadge && <span className="badge badge-cleaning">✓ {hotel.cleaningBadge} Certified</span>}
              </div>
            </div>

            <div className="rooms">
              {hotel.rooms.map((room) => (
                <div key={room.id} className="room">
                  <div className="room-header">
                    <div className="room-name">{room.name}</div>
                    <div className="room-price">
                      <div className="price-total">${room.totalPrice.toFixed(2)}</div>
                      {room.pricePerPerson && <div className="price-per-person">${room.pricePerPerson.toFixed(2)} per person</div>}
                    </div>
                  </div>

                  {(room.addedValues && room.addedValues.length > 0) || (room.valueIndicators && room.valueIndicators.length > 0) ? (
                    <div className="room-details">
                      {room.addedValues?.map((value, i) => (
                        <span key={`promo-${i}`} className="tag tag-promotion">
                          🎁 {value}
                        </span>
                      ))}
                      {room.valueIndicators?.map((indicator, i) => (
                        <span key={`indicator-${i}`} className="tag tag-value">
                          ✨ {indicator}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
