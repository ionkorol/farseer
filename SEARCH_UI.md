# Farseer Search UI - Quick Start Guide

## 🚀 Start the Server

Then open your browser to: **http://localhost:3000**

## ✨ Features

### 1. **Smart Autocomplete**

- Type in the Origin field → filters available airports for selected vendor
- Select an origin → automatically loads destinations available from that origin
- Type in Destination field → filters available destinations
- Minimum 2 characters required for autocomplete

### 2. **Search Form Fields**

- **Vendor**: Dropdown populated with live vendors from VAX
- **Origin**: Autocomplete input with real-time filtering
- **Destination**: Autocomplete input (filtered by selected origin)
- **Check-in Date**: Date picker (defaults to tomorrow)
- **Check-out Date**: Date picker (defaults to 7 days after check-in)
- **Adults per Room**: Number input (1-8, defaults to 2)

### 3. **Loading Experience**

- Animated spinner while searching
- "Searching for the best deals..." message
- Disabled search button during search to prevent duplicate requests

### 4. **Search Results Display**

Each hotel card shows:

- Hotel name and star rating (⭐)
- Location and distance from airport
- TripAdvisor rating and review count (if available)
- Cleaning/safety badges
- Available room options with:
  - Room type name
  - Total price (large, highlighted)
  - Price per person
  - Special promotions/credits

### 5. **Error Handling**

- Form validation (all fields required)
- Origin/destination must be selected from autocomplete
- API errors displayed in red alert box
- Graceful "No results found" state

## 🎨 Design Features

- Modern gradient background (purple/blue)
- Card-based UI with shadow effects
- Hover animations on hotel cards
- Smooth scrolling to results
- Responsive grid layout
- Mobile-friendly design

## 🔧 Technical Details

### API Endpoints Created

| Endpoint            | Method | Description                                          |
| ------------------- | ------ | ---------------------------------------------------- |
| `/`                 | GET    | Serves the HTML search page                          |
| `/api/vendors`      | GET    | Returns list of available vendors                    |
| `/api/origins`      | GET    | Returns origin markets for vendor/package            |
| `/api/destinations` | GET    | Returns destinations (optionally filtered by origin) |
| `/api/search`       | POST   | Executes search and returns hotel results            |

### Files Created

```
src/server/
├── server.ts           # Bun HTTP server with API endpoints
├── public/
│   └── index.html     # Search UI (HTML + CSS + JavaScript)
└── README.md          # Detailed documentation
```

## 🎯 Usage Flow

1. **Page loads** → Vendors automatically loaded into dropdown
2. **Select vendor** → Origins loaded in background
3. **Type in origin** → Autocomplete shows matching airports
4. **Select origin** → Destinations loaded for that origin
5. **Type in destination** → Autocomplete shows matching destinations
6. **Select destination** → User can proceed with dates
7. **Set dates and adults** → User reviews form
8. **Click Search** → Loading screen appears
9. **Results display** → Hotel cards with rooms and pricing

## 📝 Example Search

1. Select "Funjet Vacations" from vendor dropdown
2. Type "atlanta" in Origin → Select "Atlanta, Georgia (ATL)"
3. Type "vegas" in Destination → Select "Las Vegas, Nevada (LAS)"
4. Choose your dates (pre-filled with tomorrow + 7 nights)
5. Keep adults at 2 or adjust
6. Click "🔍 Search Vacations"
7. View results with hotels and room options!

## 🔐 Authentication

- Server automatically logs in to VAX on first API request
- Session is cached and reused for subsequent requests
- No manual login required from the UI

## ⚡ Performance

- Autocomplete lists are cached client-side after first load
- Session persistence reduces login overhead
- Smooth animations and transitions for better UX
- Efficient filtering using Array.filter() on client

## 🛠️ Customization

To customize the UI:

- Edit `src/server/public/index.html`
- Modify CSS variables in the `<style>` section
- Adjust colors, spacing, or layout as needed

To customize the API:

- Edit `src/server/server.ts`
- Add new endpoints or modify existing ones
- Extend VaxClient methods as needed
