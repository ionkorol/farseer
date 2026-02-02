export interface VaxLoginCredentials {
  arc: string;
  username: string;
  password: string;
}

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

export interface VaxLoginResponse {
  success: boolean;
  redirectUrl?: string;
  sessionCookies?: Record<string, string>;
  error?: string;
}

export interface VaxSession {
  cookies: Record<string, string>;
  arcNumber: string;
  username: string;
  loginTime: Date;
}

export interface VaxSearchParams {
  vendor: string;
  packageType: string;
  origin: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adultsPerRoom: number[];
  childrenPerRoom: number[];
  childAges: number[][];
}

export interface VaxRoomOption {
  code: string;
  name: string;
  totalPrice: number;
  pricePerPerson: number | null;
  addedValues: string[];
  valueIndicators: string[];
}

export interface VaxHotelResult {
  id: string;
  name: string;
  rating: number;
  tripAdvisorRating: number | null;
  tripAdvisorReviews: number | null;
  location: string;
  distanceFromAirport: number | null;
  rooms: VaxRoomOption[];
  vendor: string;
  remoteSource: string;
  destinationCode: string;
  checkIn: Date;
  checkOut: Date;
  cleaningBadge: string | null;
}

export interface VaxMarketsResponse {
  d: Array<{ __type: string; C: string; D: string }>;
}
