/**
 * VAX Vacation Access API Models
 */

/**
 * Login credentials for VAX system
 */
export interface VaxLoginCredentials {
  /** Agent Reference Code (ARC) */
  arc: string;
  /** Username */
  username: string;
  /** Password */
  password: string;
}

/**
 * Form data structure for VAX login POST request
 * Mirrors the ASP.NET ViewState and form structure
 */
export interface VaxLoginFormData {
  ctl00_ContentPlaceHolder_sm_HiddenField: string;
  __LASTFOCUS: string;
  __EVENTTARGET: string;
  __EVENTARGUMENT: string;
  __VIEWSTATE: string;
  __VIEWSTATEGENERATOR: string;
  __EVENTVALIDATION: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$Arc: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vceARCRequired_ClientState: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vceTcvArc_ClientState: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$UserName: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vceUserNameRequired_ClientState: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vceTcvUserName_ClientState: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$Password: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vcePasswordRequired_ClientState: string;
  ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$LoginButton: string;
  hdnRedirectUrl: string;
}

/**
 * Response from login attempt
 */
export interface VaxLoginResponse {
  success: boolean;
  redirectUrl?: string;
  sessionCookies?: Record<string, string>;
  error?: string;
}

/**
 * Session information after successful login
 */
export interface VaxSession {
  cookies: Record<string, string>;
  arcNumber: string;
  username: string;
  loginTime: Date;
}

/**
 * Search parameters for vacation packages
 */
export interface VaxSearchParams {
  /** Vendor/supplier code (e.g., "FJ1" for Funjet) */
  vendor: string;
  /** Package type (e.g., "AH" for Flight + Hotel) */
  packageType: string;
  /** Departure/origin location */
  origin: string;
  /** Destination location */
  destination: string;
  /** Check-in date (YYYY-MM-DD) */
  checkIn: string;
  /** Check-out date (YYYY-MM-DD) */
  checkOut: string;
  /** Number of rooms */
  rooms: number;
  /** Number of adults per room */
  adultsPerRoom: number[];
  /** Number of children per room */
  childrenPerRoom: number[];
  /** Ages of children (if applicable) */
  childAges: number[][];
}

/**
 * Response from a search request
 */
export interface VaxSearchResponse {
  success: boolean;
  hotels: VaxHotelResult[];
  error?: string;
}

/**
 * Hotel room option
 */
export interface VaxRoomOption {
  /** Room type code */
  code: string;
  /** Room description (e.g., "Bleau King", "Pyramid Premier King Room") */
  name: string;
  /** Total price for the stay */
  totalPrice: number;
  /** Price per person */
  pricePerPerson?: number;
  /** Added value promotions (e.g., "$150 Food & Beverage credit") */
  addedValues?: string[];
  /** Value indicators (e.g., "Upgrade Bonus $ Available", "Contracted Connect Hotel") */
  valueIndicators?: string[];
}

/**
 * Individual hotel result
 */
export interface VaxHotelResult {
  /** Hotel ID */
  hotelId: string;
  /** Hotel name */
  name: string;
  /** Hotel star rating (1-5) */
  rating: number;
  /** TripAdvisor rating (e.g., 4.2) */
  tripAdvisorRating?: number;
  /** Number of TripAdvisor reviews */
  tripAdvisorReviews?: number;
  /** Location description */
  location: string;
  /** Distance from airport in miles */
  distanceFromAirport?: number;
  /** Available room options */
  rooms: VaxRoomOption[];
  /** Vendor code (e.g., "FJ1") */
  vendor: string;
  /** Remote source code (e.g., "HBSHotel", "HBSBlock") */
  remoteSource: string;
  /** Destination code (e.g., "LAS") */
  destinationCode: string;
  /** Check-in date */
  checkIn: string;
  /** Check-out date */
  checkOut: string;
  /** Cleaning/safety badges (e.g., "LX" for Luxe) */
  cleaningBadge?: string;
}

/**
 * Vendor information
 */
export interface VaxVendor {
  /** Vendor code (e.g., "FJ1", "APV") */
  code: string;
  /** Vendor name (e.g., "Funjet Vacations") */
  name: string;
}

export interface VaxMarket {
  /** code (e.g., "ATL", "LAX") */
  code: string;
  /** description (e.g., "Atlanta, Georgia (ATL)") */
  description: string;
}

export interface VaxMarketsResponse {
  d: Array<{ __type: string; C: string; D: string }>;
}
