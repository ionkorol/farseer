import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import "./SearchForm.css";
import type { ISupplierMarket } from "@/suppliers/supplier-interface.js";

export function SearchForm() {
  const [selectedOrigin, setSelectedOrigin] = useState<ISupplierMarket | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<ISupplierMarket | null>(null);

  const [originSearch, setOriginSearch] = useState("");
  const [destinationSearch, setDestinationSearch] = useState("");
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);

  const { data: origins = [] } = useQuery({
    queryKey: ["origins"],
    queryFn: async () => {
      const res = await fetch("/api/origins");
      if (!res.ok) {
        throw new Error("Failed to fetch origins");
      }
      return res.json() as Promise<ISupplierMarket[]>;
    },
  });

  const { data: destinations = [] } = useQuery({
    queryKey: ["destinations"],
    queryFn: async () => {
      if (!selectedOrigin) return [];
      const res = await fetch("/api/destinations");
      if (!res.ok) {
        throw new Error("Failed to fetch destinations");
      }
      return res.json() as Promise<ISupplierMarket[]>;
    },
    enabled: !!selectedOrigin,
  });

  const [error, setError] = useState("");

  // Set default dates
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const checkInDate = tomorrow.toISOString().split("T")[0];
    if (checkInDate) setCheckIn(checkInDate);

    const weekLater = new Date(tomorrow);
    weekLater.setDate(weekLater.getDate() + 7);
    const checkOutDate = weekLater.toISOString().split("T")[0];
    if (checkOutDate) setCheckOut(checkOutDate);
  }, []);

  const filteredOrigins = origins.filter(
    (origin) =>
      originSearch.length >= 2 &&
      (origin.name.toLowerCase().includes(originSearch.toLowerCase()) || origin.id.toLowerCase().includes(originSearch.toLowerCase())),
  );

  const filteredDestinations = destinations.filter(
    (dest) =>
      destinationSearch.length >= 2 &&
      (dest.name.toLowerCase().includes(destinationSearch.toLowerCase()) || dest.id.toLowerCase().includes(destinationSearch.toLowerCase())),
  );

  const handleOriginSelect = (origin: ISupplierMarket) => {
    setSelectedOrigin(origin);
    setOriginSearch(origin.name);
    setShowOriginDropdown(false);
  };

  const handleDestinationSelect = (dest: ISupplierMarket) => {
    setSelectedDestination(dest);
    setDestinationSearch(dest.name);
    setShowDestinationDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedOrigin || !selectedDestination) {
      setError("Please select both origin and destination from the dropdown.");
      return;
    }

    setError("");
    console.log("Submitting search:", {
      origin: selectedOrigin,
      destination: selectedDestination,
      checkIn,
      checkOut,
      adults,
    });

    try {
      // Create search request via API
      const response = await fetch(
        `/api/search?origin=${selectedOrigin.id}&destination=${selectedDestination.id}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}`,
      );

      if (!response.ok) {
        throw new Error("Failed to create search request");
      }

      const { requestId } = await response.json();

      // Redirect to results page with request ID
      window.location.href = `/results?requestId=${requestId}`;
    } catch (err) {
      setError("Failed to start search. Please try again.");
      console.error("Search error:", err);
    }
  };

  return (
    <div className="search-form-container">
      <div className="search-form-content">
        <div className="search-form-header">
          <h1 className="search-form-title">🌎 Farseer</h1>
          <p className="search-form-subtitle">Find your perfect vacation package</p>
        </div>

        <div className="search-form-card">
          <form onSubmit={handleSubmit}>
            <div className="search-form-grid">
              <div className="search-form-field-group">
                <label className="search-form-label">Origin</label>
                <input
                  type="text"
                  value={originSearch}
                  onChange={(e) => {
                    setOriginSearch(e.target.value);
                    setShowOriginDropdown(true);
                    setSelectedOrigin(null);
                  }}
                  onFocus={() => setShowOriginDropdown(true)}
                  placeholder="e.g., Atlanta (ATL)"
                  required
                  className="search-form-input"
                />
                {showOriginDropdown && originSearch.length >= 2 && (
                  <div className="search-form-dropdown">
                    {origins.length === 0 ? (
                      <div className="search-form-empty-message">Please select a vendor first</div>
                    ) : filteredOrigins.length === 0 ? (
                      <div className="search-form-empty-message">No matches found</div>
                    ) : (
                      filteredOrigins.map((origin) => (
                        <div key={origin.id} onClick={() => handleOriginSelect(origin)} className="search-form-dropdown-item">
                          {origin.name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="search-form-field-group">
                <label className="search-form-label">Destination</label>
                <input
                  type="text"
                  value={destinationSearch}
                  onChange={(e) => {
                    setDestinationSearch(e.target.value);
                    setShowDestinationDropdown(true);
                    setSelectedDestination(null);
                  }}
                  onFocus={() => setShowDestinationDropdown(true)}
                  placeholder="e.g., Las Vegas (LAS)"
                  required
                  className="search-form-input"
                />
                {showDestinationDropdown && destinationSearch.length >= 2 && (
                  <div className="search-form-dropdown">
                    {destinations.length === 0 ? (
                      <div className="search-form-empty-message">Please select an origin first</div>
                    ) : filteredDestinations.length === 0 ? (
                      <div className="search-form-empty-message">No matches found</div>
                    ) : (
                      filteredDestinations.map((dest) => (
                        <div key={dest.id} onClick={() => handleDestinationSelect(dest)} className="search-form-dropdown-item">
                          {dest.name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="search-form-label">Check-in</label>
                <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required className="search-form-input" />
              </div>

              <div>
                <label className="search-form-label">Check-out</label>
                <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required className="search-form-input" />
              </div>

              <div>
                <label className="search-form-label">Adults per Room</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={adults}
                  onChange={(e) => setAdults(parseInt(e.target.value))}
                  required
                  className="search-form-input"
                />
              </div>
            </div>

            {error && <div className="search-form-error">{error}</div>}

            <button type="submit" className="search-form-submit-button">
              🔍 Search Vacations
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
