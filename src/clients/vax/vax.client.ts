import type { AxiosInstance } from "axios";
import { createBaseClient, CookieJar } from "../baseClient.js";
import { createSessionStorage, type SessionStorage } from "../../utils/sessionStorage.js";
import { ResponseStorage } from "../../utils/responseStorage.js";
import { config } from "../../config/env.js";
import { getAspNetFormScriptManagerField, parseAspNetFormHiddenInputs } from "../../utils/aspnet-form.utils.js";
import { getCachedSearchResults, saveSearchResultsToCache } from "../../lib/searchCache.js";
import * as cheerio from "cheerio";
import type {
  VaxLoginCredentials,
  VaxLoginFormData,
  VaxLoginResponse,
  VaxSearchParams,
  VaxSearchResponse,
  VaxSession,
  VaxHotelResult,
  VaxRoomOption,
  VaxVendor,
  VaxMarket,
  VaxMarketsResponse,
} from "./vax.models.js";

const credentials: VaxLoginCredentials = {
  arc: config.vax.arc,
  username: config.vax.username,
  password: config.vax.password,
};

export class VaxClient {
  private client: AxiosInstance;
  private cookieJar: CookieJar;
  private session: VaxSession | null = null;
  private readonly baseURL = "https://login.www.vaxvacationaccess.com";
  private sessionStorage: SessionStorage;
  private responseStorage: ResponseStorage | null;
  private readonly sessionTTL: number;

  constructor() {
    this.sessionStorage = createSessionStorage();
    this.responseStorage = new ResponseStorage();
    this.sessionTTL = config.session.ttlMs;
    this.client = createBaseClient({
      baseURL: this.baseURL,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8,ro;q=0.7",
        "Cache-Control": "no-cache",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: this.baseURL,
        Pragma: "no-cache",
        Referer: `${this.baseURL}/default.aspx`,
        "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      },
      timeout: 300_000,
    });

    this.cookieJar = new CookieJar();
  }

  /**
   * Generate a unique session ID for this user
   */
  private getSessionId(username: string, arc: string): string {
    return `vax_${arc}_${username}`;
  }

  async restoreSession(username: string, arc: string): Promise<boolean> {
    if (!this.sessionStorage) {
      return false;
    }

    const sessionId = this.getSessionId(username, arc);
    const sessionData = await this.sessionStorage.loadSession(sessionId);

    if (!sessionData) {
      return false;
    }

    // Restore session and cookies
    this.session = {
      cookies: sessionData.cookies,
      arcNumber: arc,
      username: username,
      loginTime: new Date(sessionData.loginTime),
    };

    // Restore cookies to cookie jar
    Object.entries(sessionData.cookies as Record<string, string>).forEach(([name, value]) => {
      this.cookieJar["cookies"].set(name, value);
    });

    return true;
  }

  /**
   * Save current session to cache
   */
  private async saveSession(): Promise<void> {
    if (!this.sessionStorage || !this.session) {
      return;
    }

    const sessionId = this.getSessionId(this.session.username, this.session.arcNumber);
    await this.sessionStorage.saveSession(
      sessionId,
      {
        cookies: this.session.cookies,
        loginTime: this.session.loginTime.toISOString(),
        arcNumber: this.session.arcNumber,
        username: this.session.username,
      },
      this.sessionTTL
    );
  }

  /**
   * Clear cached session
   */
  private async clearCachedSession(): Promise<void> {
    if (!this.sessionStorage || !this.session) {
      return;
    }

    const sessionId = this.getSessionId(this.session.username, this.session.arcNumber);
    await this.sessionStorage.deleteSession(sessionId);
  }

  /**
   * Fetch the login page to get initial cookies and form tokens
   * ASP.NET requires VIEWSTATE, VIEWSTATEGENERATOR, and EVENTVALIDATION tokens
   */
  private async getLoginPageTokens(): Promise<{
    viewState: string;
    viewStateGenerator: string;
    eventValidation: string;
  }> {
    const response = await this.client.get("/default.aspx");

    const setCookieHeaders = response.headers["set-cookie"];
    if (setCookieHeaders) {
      this.cookieJar.setCookies(setCookieHeaders);
    }

    const html = response.data as string;

    const viewStateMatch = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
    const viewStateGeneratorMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
    const eventValidationMatch = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

    if (!viewStateMatch || !viewStateGeneratorMatch || !eventValidationMatch) {
      throw new Error("Failed to extract ASP.NET form tokens from login page");
    }

    return {
      viewState: viewStateMatch[1] || "",
      viewStateGenerator: viewStateGeneratorMatch[1] || "",
      eventValidation: eventValidationMatch[1] || "",
    };
  }

  /**
   * Build the form data payload for login POST request
   */
  private buildLoginFormData(
    credentials: VaxLoginCredentials,
    tokens: { viewState: string; viewStateGenerator: string; eventValidation: string }
  ): URLSearchParams {
    const formData: VaxLoginFormData = {
      ctl00_ContentPlaceHolder_sm_HiddenField:
        ";AjaxControlToolkit, Version=3.0.20820.100, Culture=neutral, PublicKeyToken=28f01b0e84b6d53e:en-US:4c3d9860-2e06-4722-a6e5-a622d77d3633:411fea1c:865923e8:e7c87f07:91bd373d:bbfda34c:30a78ec5:5430d994;Trisept.UI.Web.Shell:en-US:caf83fe0-1a44-48b8-9a4f-67c4484f426a:53482884:baba344c:4e089d68:e4770b2c:c33b30a7:1aed194b:e234562e:9dda3150:aa92e3ca:eca68493;Trisept.UI.Web.Shell.Foundation:en-US:5f23006c-37b1-4078-8aba-c57b368ad878:b56c8777",
      __LASTFOCUS: "",
      __EVENTTARGET: "",
      __EVENTARGUMENT: "",
      __VIEWSTATE: tokens.viewState,
      __VIEWSTATEGENERATOR: tokens.viewStateGenerator,
      __EVENTVALIDATION: tokens.eventValidation,
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$Arc: credentials.arc,
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vceARCRequired_ClientState: "",
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vceTcvArc_ClientState: "",
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$UserName: credentials.username,
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vceUserNameRequired_ClientState: "",
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vceTcvUserName_ClientState: "",
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$Password: credentials.password,
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$vcePasswordRequired_ClientState: "",
      ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$LoginButton: "Login",
      hdnRedirectUrl: "https://www.vaxvacationaccess.com/",
    };

    // Convert to URLSearchParams for proper form encoding
    const params = new URLSearchParams();
    Object.entries(formData).forEach(([key, value]) => {
      params.append(key, value);
    });

    return params;
  }

  /**
   * Authenticate with VAX Vacation Access
   * Automatically tries to restore cached session before making a login request
   * @param credentials - Login credentials (ARC, username, password)
   * @param forceLogin - Force fresh login even if cached session exists
   * @returns Login response with session information
   */
  async login(): Promise<VaxLoginResponse> {
    try {
      // Try to restore session from cache first
      if (this.sessionStorage) {
        const restored = await this.restoreSession(credentials.username, credentials.arc);
        if (restored && this.session) {
          console.log("✓ Session restored from cache");
          return {
            success: true,
            sessionCookies: this.session.cookies,
          };
        }
      }

      const tokens = await this.getLoginPageTokens();
      const formData = this.buildLoginFormData(credentials, tokens);

      console.log(`Attempting login for user: ${credentials.username}`);
      const response = await this.client.post("/default.aspx", formData.toString(), {
        headers: {
          Cookie: this.cookieJar.getCookieHeader(),
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400, // Accept 3xx responses
      });

      if (this.responseStorage) {
        await this.responseStorage.saveResponse("vax_login", response.data as string);
      }

      // Step 4: Update cookies from response
      const setCookieHeaders = response.headers["set-cookie"];
      if (setCookieHeaders) {
        this.cookieJar.setCookies(setCookieHeaders);
      }

      // Step 5: Check for successful login (redirect to main site)
      const isRedirect = response.status >= 300 && response.status < 400;
      const redirectUrl = response.headers["location"];

      if (isRedirect && redirectUrl?.includes("vaxvacationaccess.com")) {
        // Login successful - now follow the redirect to establish session on new domain
        console.log(`Following redirect to: ${redirectUrl}`);

        try {
          const redirectResponse = await this.client.get(redirectUrl, {
            headers: {
              Cookie: this.cookieJar.getCookieHeader(),
              Referer: `${this.baseURL}/default.aspx`,
            },
            maxRedirects: 5,
          });

          this.cookieJar.setCookiesFromResponse(redirectResponse);

          console.log("✓ Session established on search domain");
        } catch (redirectError) {
          console.warn("Failed to follow redirect, but continuing:", redirectError);
        }

        this.session = {
          cookies: Object.fromEntries(this.cookieJar["cookies"]),
          arcNumber: credentials.arc,
          username: credentials.username,
          loginTime: new Date(),
        };

        // Save session to cache
        await this.saveSession();

        return {
          success: true,
          redirectUrl,
          sessionCookies: this.session.cookies,
        };
      }

      // Check response HTML for error messages
      const html = response.data as string;
      if (html.includes("Login failed") || html.includes("Invalid credentials")) {
        return {
          success: false,
          error: "Invalid credentials",
        };
      }

      return {
        success: false,
        error: "Login failed - unexpected response",
      };
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  getSession(): VaxSession | null {
    return this.session;
  }

  isLoggedIn(): boolean {
    return this.session !== null;
  }

  async ensureLoggedIn(): Promise<void> {
    if (!this.isLoggedIn()) {
      await this.login();
    }
  }

  async logout(): Promise<void> {
    await this.clearCachedSession();
    this.session = null;
    this.cookieJar.clear();
  }


  async search(params: VaxSearchParams): Promise<VaxSearchResponse> {
    if (!this.isLoggedIn()) {
      return {
        success: false,
        hotels: [],
        error: "Not logged in. Please call login() first.",
      };
    }

    try {
      const searchUrl = "https://new.www.vaxvacationaccess.com/Search/Default.aspx";

      let searchGetHtml = await this.responseStorage?.readResponse(`vax_search_get_${params.vendor}`);
      if (!searchGetHtml) {
        const searchGetResponse = await this.client.get<string>(searchUrl, {
          headers: {
            Cookie: this.cookieJar.getCookieHeader(),
          },
        });
        searchGetHtml = searchGetResponse.data;
        await this.responseStorage?.saveResponse(`vax_search_get_${params.vendor}`, searchGetHtml);
      }

      try {
        await this.extractVendors(searchGetHtml);
      } catch (vendorError) {
        console.warn("Failed to extract/save vendors:", vendorError);
      }

      const formHiddenValues = parseAspNetFormHiddenInputs(searchGetHtml, "aspnetForm");
      const smField = getAspNetFormScriptManagerField(searchGetHtml);
      const formatContentPlaceholderKey = (key: string) => `ctl00$ctl00$ContentPlaceHolder$ContentPlaceHolder$${key}`;
      const formatSearchComponentsKey = (key: string) =>
        `ctl00$ctl00$ContentPlaceHolder$ContentPlaceHolder$scncc$ctl00$NavigationRepeater$ctl00$ctl00$SearchComponents$scc$rt$${key}`;

      const body = {
        ...formHiddenValues,
        [formatContentPlaceholderKey("sm")]: smField,
        ctl00$ctl00$ContentPlaceHolder$ContentPlaceHolder$scncc$ctl00$NavigationRepeater$ctl00$ctl00$SearchComponents$ReservationToolType:
          "SingleStop",
        [formatSearchComponentsKey("vendor")]: params.vendor,
        [formatSearchComponentsKey("package")]: params.packageType,
        [formatSearchComponentsKey("Origin")]: "Atlanta, Georgia (ATL)",
        [formatSearchComponentsKey("Destination")]: "Las Vegas, Nevada (LAS)",
        [formatSearchComponentsKey("departure")]: "10JAN26",
        [formatSearchComponentsKey("numberOfNights")]: 7,
        [formatSearchComponentsKey("return")]: "17JAN26",
        [formatSearchComponentsKey("passengers$numrooms")]: 1,
        [formatSearchComponentsKey("passengers$MaxPaxTextBox")]: "",
        [formatSearchComponentsKey("passengers$pr$ctl00$pi$adults")]: 2,
        [formatSearchComponentsKey("passengers$pr$ctl00$pi$children")]: 0,
        [formatSearchComponentsKey("passengers$pr$ctl00$pi$cr$ctl01$ChildAgeInput")]: "",
        [formatSearchComponentsKey("passengers$pr$ctl00$pi$cr$ctl01$ChildDOBInput")]: "",
        [formatSearchComponentsKey("passengers$pr$ctl00$pi$cr$ctl01$DateDropDownComponentDisplay$MonthDropDown")]: "",
        [formatSearchComponentsKey("passengers$pr$ctl00$pi$cr$ctl01$ChildDOBInput")]: "",
        [formatSearchComponentsKey("passengers$pr$ctl00$pi$cr$ctl01$DateDropDownComponentDisplay$YearDropDown")]: "",
        [formatSearchComponentsKey("promocode")]: "",
        [formatSearchComponentsKey("aircarrier")]: "~",
        [formatSearchComponentsKey("aircabin")]: "Y",
        [formatSearchComponentsKey("airstops")]: 50,
        [formatSearchComponentsKey("airdepart")]: "",
        [formatSearchComponentsKey("airreturn")]: "",
        [formatSearchComponentsKey("airfare")]: "",
        [formatSearchComponentsKey("hotelname")]: "",
        [formatSearchComponentsKey("drpDownHotelBrandInput")]: "~",
        [formatSearchComponentsKey("hotelcheckin")]: "10JAN26",
        [formatSearchComponentsKey("hotelcheckout")]: "17JAN26",
        [formatSearchComponentsKey("vehiclebrand")]: "~",
        [formatSearchComponentsKey("vehiclepickupdate")]: "10JAN26",
        [formatSearchComponentsKey("vehicledropoffdate")]: "17JAN26",
        [formatSearchComponentsKey("submit")]: "Search",
        __ASYNCPOST: false,
      };

      let searchPostHtml = await this.responseStorage?.readResponse(`vax_search_post_${params.vendor}`);
      if (!searchPostHtml) {
        const searchPostResponse = await this.client.post<string>(searchUrl, body, {
          headers: {
            accept: "*/*",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            cookie: this.cookieJar.getCookieHeader(),
            Referer: searchUrl,
          },
        });
        searchPostHtml = searchPostResponse.data;
        await this.responseStorage?.saveResponse(`vax_search_post_${params.vendor}`, searchPostHtml);
      }

      const hotels = await this.parseSearchHtml(searchPostHtml);

      console.log(`Found ${hotels.length} hotel(s)`);

      return {
        success: true,
        hotels,
      };
    } catch (error) {
      console.error("Search error:", error);
      return {
        success: false,
        hotels: [],
        error: error instanceof Error ? error.message : "Unknown error occurred during search",
      };
    }
  }

  async parseSearchHtml(html: string): Promise<VaxHotelResult[]> {
    try {
      const $ = cheerio.load(html);
      const hotels: VaxHotelResult[] = [];

      // Extract check-in and check-out dates from the header
      const headerText = $(".avail-content-wrap").text();
      const checkInMatch = headerText.match(/Check-in\s*-\s*(\d{2}[A-Z]{3}\d{2})/i);
      const checkOutMatch = headerText.match(/Check-out\s*-\s*(\d{2}[A-Z]{3}\d{2})/i);
      const checkIn = checkInMatch?.[1] ? this.parseVaxShortDate(checkInMatch[1]) : "";
      const checkOut = checkOutMatch?.[1] ? this.parseVaxShortDate(checkOutMatch[1]) : "";

      // Find all hotel rows (rows with class 'room-repeater-visibility' contain the hotel info)
      const hotelRows = $("tr.room-repeater-visibility");
      console.log(`Parsing ${hotelRows.length} hotel sections...`);

      hotelRows.each((_index, element) => {
        try {
          const $hotelRow = $(element);
          const hotel = this.parseHotelSection($hotelRow, checkIn, checkOut);
          if (hotel) {
            hotels.push(hotel);
          }
        } catch (err) {
          console.warn("Failed to parse hotel section:", err);
        }
      });

      return hotels;
    } catch (error) {
      console.error("Error parsing search HTML:", error);
      return [];
    }
  }

  /**
   * Parse a single hotel section from the HTML using Cheerio
   * $hotelRow is the <tr> with class 'room-repeater-visibility'
   */
  private parseHotelSection($hotelRow: cheerio.Cheerio<any>, checkIn: string, checkOut: string): VaxHotelResult | null {
    try {
      // Find the hotel-info-wrapper within this row
      const $hotelInfo = $hotelRow.find(".hotel-info-wrapper");
      if (!$hotelInfo.length) {
        return null;
      }

      // Extract hotel name - the link has the URL in the onclick attribute, not href
      const nameLink = $hotelInfo.find('a[onclick*="HotelInformation/Default.aspx"]').first();
      const name = nameLink.text().trim();

      if (!name) {
        return null;
      }

      // Extract hotel ID and other params from the onclick attribute
      const onclickAttr = nameLink.attr("onclick") || "";
      const hotelIdMatch = onclickAttr.match(/HotelId=(\d+)/);
      const hotelId = hotelIdMatch?.[1] || "";

      const vendorMatch = onclickAttr.match(/VendorCode=([^&]+)/);
      const vendor = vendorMatch?.[1] || "";

      const remoteSourceMatch = onclickAttr.match(/RemoteSourceCode=([^&]+)/);
      const remoteSource = remoteSourceMatch?.[1] || "";

      const destCodeMatch = onclickAttr.match(/DestinationCode=([^&]+)/);
      const destinationCode = destCodeMatch?.[1] || "";

      // Extract star rating - count the number of rating_ST images
      const rating = $hotelInfo.find(".rating_ST").length;

      // Extract TripAdvisor rating and reviews
      let tripAdvisorRating: number | undefined;
      let tripAdvisorReviews: number | undefined;
      const tripAdvisorImg = $hotelInfo.find('img[alt*="of 5 stars"]');
      if (tripAdvisorImg.length > 0) {
        const altText = tripAdvisorImg.attr("alt") || "";
        const ratingMatch = altText.match(/([\d.]+) of 5 stars/);
        if (ratingMatch?.[1]) {
          tripAdvisorRating = parseFloat(ratingMatch[1]);
        }
        // Find the review count in the link text
        const reviewLink = $hotelInfo.find('a:contains("Based on")');
        if (reviewLink.length > 0) {
          const reviewText = reviewLink.text();
          const reviewsMatch = reviewText.match(/Based on ([\d,]+) reviews/);
          if (reviewsMatch?.[1]) {
            tripAdvisorReviews = parseInt(reviewsMatch[1].replace(/,/g, ""), 10);
          }
        }
      }

      // Extract location
      const location = $hotelInfo.find(".hotel-location-info").first().text().trim();

      // Extract distance from airport
      let distanceFromAirport: number | undefined;
      const distanceText = $hotelInfo.find("strong:contains('miles')").text();
      const distanceMatch = distanceText.match(/([\d.]+) miles/);
      if (distanceMatch?.[1]) {
        distanceFromAirport = parseFloat(distanceMatch[1]);
      }

      // Extract cleaning badge (it's outside hotel-info-wrapper, so search in the entire row)
      let cleaningBadge: string | undefined;
      const badgeButton = $hotelRow.find("button.cleaning-badge");
      if (badgeButton.length > 0) {
        const onclickAttr = badgeButton.attr("onclick") || "";
        const badgeMatch = onclickAttr.match(/program=([^&'"]+)/);
        if (badgeMatch?.[1]) {
          cleaningBadge = badgeMatch[1];
        }
      }

      // Parse room options from the next sibling rows
      const rooms = this.parseRoomOptions($hotelRow);

      const result: VaxHotelResult = {
        hotelId,
        name,
        rating,
        location,
        rooms,
        vendor,
        remoteSource,
        destinationCode,
        checkIn,
        checkOut,
      };

      // Add optional properties only if they have values
      if (tripAdvisorRating !== undefined) {
        result.tripAdvisorRating = tripAdvisorRating;
      }
      if (tripAdvisorReviews !== undefined) {
        result.tripAdvisorReviews = tripAdvisorReviews;
      }
      if (distanceFromAirport !== undefined) {
        result.distanceFromAirport = distanceFromAirport;
      }
      if (cleaningBadge !== undefined) {
        result.cleaningBadge = cleaningBadge;
      }

      return result;
    } catch (error) {
      console.warn("Error parsing hotel section:", error);
      return null;
    }
  }

  /**
   * Parse room options from the rows following the hotel row
   * $hotelRow is the <tr> with class 'room-repeater-visibility'
   */
  private parseRoomOptions($hotelRow: cheerio.Cheerio<any>): VaxRoomOption[] {
    const rooms: VaxRoomOption[] = [];

    // Find room rows by looking at the next sibling rows until we hit another hotel row
    let $nextRow = $hotelRow.next();

    while ($nextRow.length > 0 && !$nextRow.hasClass("room-repeater-visibility")) {
      const $roomWrapper = $nextRow.find(".hotel-avail-room-type-wrap");

      if ($roomWrapper.length > 0) {
        try {
          // Extract room name - the link has the URL in the onclick attribute, not href
          const roomLink = $roomWrapper.find('a[onclick*="room="]').first();
          const onclickAttr = roomLink.attr("onclick") || "";
          const roomCodeMatch = onclickAttr.match(/room=([^&]+)/);
          const code = roomCodeMatch?.[1] || "";
          const name = roomLink.text().trim();

          if (!name) {
            // Skip to next row if no room name found
            $nextRow = $nextRow.next();
            continue;
          }

          // Extract price from the third column (hotel-room-col-3)
          const priceText = $nextRow.find(".hotel-room-col-3 strong").first().text();
          const priceMatch = priceText.match(/\$([0-9,]+\.\d{2})/);
          const totalPrice = priceMatch?.[1] ? parseFloat(priceMatch[1].replace(/,/g, "")) : 0;

          // Extract price per person from the tooltip
          let pricePerPerson: number | undefined;
          const perPersonText = $nextRow.find(".hotel-room-col-3").text();
          const perPersonMatch = perPersonText.match(/\$([0-9,]+\.\d{2}) per person/);
          if (perPersonMatch?.[1]) {
            pricePerPerson = parseFloat(perPersonMatch[1].replace(/,/g, ""));
          }

          // Extract added values (promotions) from the second column
          const addedValues: string[] = [];
          $nextRow.find(".added-value-wrap button.link").each((_i: number, btn: any) => {
            const value = cheerio.load(btn).root().text().trim();
            if (value) {
              addedValues.push(value);
            }
          });

          // Extract value indicators from the second column (look for tooltip triggers)
          const valueIndicators: string[] = [];
          $nextRow.find('[id*="ValueTooltipTrigger"]').each((_i: number, span: any) => {
            const indicator = cheerio.load(span).root().text().trim();
            if (indicator) {
              valueIndicators.push(indicator);
            }
          });

          const room: VaxRoomOption = {
            code,
            name,
            totalPrice,
          };

          // Add optional properties only if they have values
          if (pricePerPerson !== undefined) {
            room.pricePerPerson = pricePerPerson;
          }
          if (addedValues.length > 0) {
            room.addedValues = addedValues;
          }
          if (valueIndicators.length > 0) {
            room.valueIndicators = valueIndicators;
          }

          rooms.push(room);
        } catch (err) {
          console.warn("Failed to parse room option:", err);
        }
      }

      // Move to the next row
      $nextRow = $nextRow.next();
    }

    return rooms;
  }

  /**
   * Parse VAX short date format to ISO string
   * Handles formats like "10JAN26" -> "2026-01-10"
   */
  private parseVaxShortDate(dateStr: string): string {
    if (!dateStr) return "";

    try {
      // Format: DDMMMYY (e.g., "10JAN26")
      const dayMatch = dateStr.match(/^(\d{2})/);
      const monthMatch = dateStr.match(/[A-Z]{3}/);
      const yearMatch = dateStr.match(/(\d{2})$/);

      if (!dayMatch || !monthMatch || !yearMatch) {
        return dateStr;
      }

      const day = dayMatch[1];
      const monthStr = monthMatch[0];
      const year = `20${yearMatch[1]}`;

      const monthMap: Record<string, string> = {
        JAN: "01",
        FEB: "02",
        MAR: "03",
        APR: "04",
        MAY: "05",
        JUN: "06",
        JUL: "07",
        AUG: "08",
        SEP: "09",
        OCT: "10",
        NOV: "11",
        DEC: "12",
      };

      const month = monthMap[monthStr] || "01";

      return `${year}-${month}-${day}`;
    } catch (e) {
      console.warn("Failed to parse short date:", dateStr);
      return dateStr;
    }
  }

  async extractLiveVendors(): Promise<VaxVendor[]> {
    const searchUrl = "https://new.www.vaxvacationaccess.com/Search/Default.aspx";
    const searchGetResponse = await this.client.get<string>(searchUrl, {
      headers: {
        Cookie: this.cookieJar.getCookieHeader(),
      },
    });
    const html = searchGetResponse.data;
    return this.extractVendors(html);
  }

  async extractVendors(html: string): Promise<VaxVendor[]> {
    const $ = cheerio.load(html);
    const vendors: VaxVendor[] = [];

    // Find the vendor select element by its specific ID
    const vendorSelect = $(
      "#ctl00_ctl00_ContentPlaceHolder_ContentPlaceHolder_scncc_ctl00_NavigationRepeater_ctl00_ctl00_SearchComponents_scc_rt_vendor"
    );

    if (!vendorSelect.length) {
      throw new Error("Vendor select element not found in HTML");
    }

    // Extract all option elements
    vendorSelect.find("option").each((_index, element) => {
      const $option = $(element);
      const code = $option.attr("value");
      const name = $option.text().trim();

      if (code && name) {
        vendors.push({
          code,
          name,
        });
      }
    });

    const sortedVendors = vendors.sort((a, b) => a.code.localeCompare(b.code));
    const vendorsPath = new URL("./vendors.json", import.meta.url).pathname;
    await Bun.write(vendorsPath, JSON.stringify(sortedVendors, null, 2));
    return sortedVendors;
  }

  async listCachedVendors(): Promise<VaxVendor[]> {
    const vendorsPath = new URL("./vendors.json", import.meta.url).pathname;
    const file = Bun.file(vendorsPath);
    const vendors: VaxVendor[] = await file.json();
    return vendors;
  }

  async listCachedOriginMarkets(vendorCode: string): Promise<VaxMarket[]> {
    const marketsPath = new URL("./origin-markets.json", import.meta.url).pathname;
    const file = Bun.file(marketsPath);
    const markets: Record<string, VaxMarket[]> = await file.json();
    return markets[vendorCode] || [];
  }

  async listCachedDestinationMarkets(vendorCode: string): Promise<VaxMarket[]> {
    const marketsPath = new URL("./destination-markets.json", import.meta.url).pathname;
    const file = Bun.file(marketsPath);
    const markets: Record<string, VaxMarket[]> = await file.json();
    return markets[vendorCode] || [];
  }

  async searchAllVendors(params: Omit<VaxSearchParams, "vendor" | "packageType">): Promise<VaxSearchResponse> {
    await this.ensureLoggedIn();

    try {
      // Check database cache first
      const cachedResults = await getCachedSearchResults(params);
      if (cachedResults) {
        console.log(`✓ Using cached multi-vendor search results from database`);
        return {
          success: true,
          hotels: cachedResults,
        };
      }

      console.log(`No cached results found, performing live multi-vendor search...`);
      const vendors = await this.extractLiveVendors();

      const allHotels: VaxHotelResult[] = [];

      for (const vendor of vendors) {
        console.log(`\nSearching vendor: ${vendor.name} (${vendor.code})`);

        try {
          const vendorParams: VaxSearchParams = {
            ...params,
            vendor: vendor.code,
            packageType: "H02", // Default to hotel-only package
          };

          const searchResponse = await this.search(vendorParams);
          if (!searchResponse.success) {
            console.log(`  ⚠ Search failed for ${vendor.name}: ${searchResponse.error || "Unknown error"}`);
            continue;
          }

          const hotelCount = searchResponse.hotels.length;
          console.log(`  ✓ Found ${hotelCount} hotels from ${vendor.name}`);
          allHotels.push(...searchResponse.hotels);

          // Add a small delay between vendor searches to avoid rate limiting
          if (vendor !== vendors[vendors.length - 1]) {
            console.log("  ⏳ Waiting 2 seconds before next vendor...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (vendorError) {
          console.error(`  ✗ Error searching vendor ${vendor.name}:`, vendorError);
          // Continue with next vendor even if one fails
        }
      }

      console.log(`\n✅ Search complete! Found ${allHotels.length} total hotels across ${vendors.length} vendors`);

      // Save aggregated results to database cache
      await saveSearchResultsToCache(params, allHotels);

      return {
        success: true,
        hotels: allHotels,
      };
    } catch (error) {
      console.log("Error during multi-vendor search:");
      console.error("Search all vendors error:", error);
      return {
        success: false,
        hotels: [],
        error: error instanceof Error ? error.message : "Unknown error occurred during multi-vendor search",
      };
    }
  }

  async saveSearchResultsToFile(hotels: VaxHotelResult[]): Promise<void> {
    const filePath = new URL("./search-results.json", import.meta.url).pathname;
    await Bun.write(filePath, JSON.stringify(hotels, null, 2));
    console.log(`✓ Saved search results to ${filePath}`);
  }

  async loadSearchPage(): Promise<string> {
    const searchUrl = "https://new.www.vaxvacationaccess.com/Search/Default.aspx";
    const response = await this.client.get<string>(searchUrl);
    this.cookieJar.setCookiesFromResponse(response);
    return response.data;
  }

  async getOriginMarkets(vendorCode: string, packageCode: string, destinationCode = "", filterOrgs = "", plCode = ""): Promise<VaxMarket[]> {
    if (!this.isLoggedIn()) {
      throw new Error("Not logged in. Please call login() first.");
    }

    const url = "https://new.www.vaxvacationaccess.com/Search/RestoolConfiguration.asmx/GetOriginMarkets";

    // Build query string manually to ensure all params are included
    const params = new URLSearchParams();
    params.append("vendorCode", `"${vendorCode}"`);
    params.append("packageCode", `"${packageCode}"`);
    params.append("destinationCode", `"${destinationCode}"`);
    params.append("filterOrgs", `"${filterOrgs}"`);
    params.append("plCode", `"${plCode}"`);

    const response = await this.client.get<VaxMarketsResponse>(`${url}?${params.toString()}`, {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json; charset=utf-8",
        Cookie: this.cookieJar.getCookieHeader(),
        Referer: "https://new.www.vaxvacationaccess.com/Search/Default.aspx",
        Origin: "https://new.www.vaxvacationaccess.com",
        "X-Requested-With": "XMLHttpRequest",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });

    return response.data.d.map((market) => ({
      code: market.C,
      description: market.D,
    }));
  }

  async getDestinationMarkets(
    vendorCode: string,
    packageCode: string,
    originCode = "",
    regionCode: string | null = null,
    themeIds: string | null = null,
    specialId: string | null = null,
    filterDests = "",
    plCode = "",
    supplierCode = ""
  ): Promise<VaxMarket[]> {
    if (!this.isLoggedIn()) {
      throw new Error("Not logged in. Please call login() first.");
    }

    try {
      const url = "https://new.www.vaxvacationaccess.com/Search/RestoolConfiguration.asmx/GetDestinationMarkets";

      // Build query string manually to ensure null values are preserved
      const params = new URLSearchParams();
      params.append("vendorCode", `"${vendorCode}"`);
      params.append("packageCode", `"${packageCode}"`);
      params.append("originCode", `"${originCode}"`);
      params.append("regionCode", regionCode ? `"${regionCode}"` : "null");
      params.append("themeIds", themeIds ? `"${themeIds}"` : "null");
      params.append("specialId", specialId ? `"${specialId}"` : "null");
      params.append("filterDests", `"${filterDests}"`);
      params.append("plCode", `"${plCode}"`);
      params.append("supplierCode", `"${supplierCode}"`);

      const response = await this.client.get<VaxMarketsResponse>(`${url}?${params.toString()}`, {
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json; charset=utf-8",
          Cookie: this.cookieJar.getCookieHeader(),
          Referer: "https://new.www.vaxvacationaccess.com/Search/Default.aspx",
          Origin: "https://new.www.vaxvacationaccess.com",
          "X-Requested-With": "XMLHttpRequest",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        },
      });

      return response.data.d.map((market) => ({
        code: market.C,
        description: market.D,
      }));
    } catch (error) {
      console.error("Error fetching destination markets:", error);
      throw error;
    }
  }

  async cacheMarketsToFile(): Promise<void> {
    const vendors = await this.listCachedVendors();
    const originMarkets = new Map<string, VaxMarket[]>();
    const destinationMarkets = new Map<string, VaxMarket[]>();
    for (const vendor of vendors) {
      console.log(`\nFetching markets for vendor: ${vendor.name} (${vendor.code})`);
      const origins = await this.getOriginMarkets(vendor.code, "H02"); // H02 = Hotel package
      const destinations = await this.getDestinationMarkets(vendor.code, "H02");

      originMarkets.set(vendor.code, origins);
      destinationMarkets.set(vendor.code, destinations);
    }

    const originsPath = new URL("./origin-markets.json", import.meta.url).pathname;
    const destinationsPath = new URL("./destination-markets.json", import.meta.url).pathname;

    const originsFile = Bun.file(originsPath);
    const destinationsFile = Bun.file(destinationsPath);

    await originsFile.write(JSON.stringify(Object.fromEntries(originMarkets), null, 2));
    await destinationsFile.write(JSON.stringify(Object.fromEntries(destinationMarkets), null, 2));
  }
}
