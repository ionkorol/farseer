import type { AxiosInstance } from "axios";
import { createBaseClient, CookieJar } from "../base-api-client.js";
import { createSessionStorage, type SessionStorage } from "@/utils/sessionStorage.js";
import { ResponseStorage } from "@/utils/responseStorage.js";
import { getAspNetFormScriptManagerField, parseAspNetFormHiddenInputs } from "@/utils/aspnet-form.utils.js";
import * as cheerio from "cheerio";
import type {
  VaxLoginCredentials,
  VaxLoginFormData,
  VaxLoginResponse,
  VaxSearchParams,
  VaxSession,
  VaxHotelResult,
  VaxRoomOption,
  VaxMarketsResponse,
} from "./vax.models.js";
import { settings } from "@/utils/settings.js";
import type {
  ISupplierClient,
  ISupplierHotel,
  ISupplierMarket,
  ISupplierSearchParams,
  ISupplierSearchResponse,
  ISupplierVendor,
} from "../supplier-interface.js";
import { type $Enums, Decimal } from "@/db/index.js";

const credentials: VaxLoginCredentials = {
  arc: settings.VAX_ARC,
  username: settings.VAX_USERNAME,
  password: settings.VAX_PASSWORD,
};

export class VaxClient implements ISupplierClient {
  readonly name: $Enums.Supplier = "VAX";

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
    this.sessionTTL = settings.SESSION_TTL_HOURS * 60 * 60 * 1000;
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

  public async search(params: ISupplierSearchParams): Promise<ISupplierSearchResponse> {
    await this.ensureLoggedIn();

    try {
      const vendors = await this.extractLiveVendors();

      const allHotels: ISupplierHotel[] = [];

      for (const vendor of vendors) {
        console.log(`\nSearching vendor: ${vendor.name} (${vendor.id})`);

        try {
          const vendorParams: VaxSearchParams = {
            ...params,
            vendor: vendor.id,
            packageType: "H02", // Default to hotel-only package
          };

          const searchResponse = await this.searchVendor(vendorParams);
          if (!searchResponse.success) {
            console.log(`  ⚠ Search failed for ${vendor.name}: ${searchResponse.error || "Unknown error"}`);
            continue;
          }

          const hotelCount = searchResponse.hotels.length;
          console.log(`  ✓ Found ${hotelCount} hotels from ${vendor.name}`);
          allHotels.push(...searchResponse.hotels);

          if (vendor !== vendors[vendors.length - 1]) {
            console.log("  ⏳ Waiting 2 seconds before next vendor...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (vendorError) {
          console.error(`  ✗ Error searching vendor ${vendor.name}:`, vendorError);
        }
      }

      console.log(`\n✅ Search complete! Found ${allHotels.length} total hotels across ${vendors.length} vendors`);

      return {
        success: true,
        hotels: allHotels,
      };
    } catch (error) {
      console.log("Error during multi-vendor search:");
      console.error("Search all vendors error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred during multi-vendor search",
      };
    }
  }

  public async listVendors(): Promise<ISupplierVendor[]> {
    await this.ensureLoggedIn();
    const vendors = await this.extractLiveVendors();
    return vendors;
  }

  public async listOriginMarkets(): Promise<ISupplierMarket[]> {
    await this.ensureLoggedIn();
    const vendors = await this.listVendors();

    const vendorMarkets = await Promise.all(vendors.map((vendor) => this.getOriginMarkets(vendor.id, "HO2")));
    const allMarkets = vendorMarkets.flat();

    return allMarkets;
  }

  public async listDestinationMarkets(): Promise<ISupplierMarket[]> {
    await this.ensureLoggedIn();
    const vendors = await this.listVendors();
    const vendorMarkets = await Promise.all(vendors.map((vendor) => this.getDestinationMarkets(vendor.id, "HO2")));
    const allMarkets = vendorMarkets.flat();
    return allMarkets;
  }

  private async searchVendor(params: VaxSearchParams): Promise<ISupplierSearchResponse> {
    if (!this.isLoggedIn()) {
      return {
        success: false,
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

      const mappedHotels = this.mapHotels(hotels);

      return {
        success: true,
        hotels: mappedHotels,
      };
    } catch (error) {
      console.error("Search error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred during search",
      };
    }
  }

  private mapHotels(hotels: VaxHotelResult[]): ISupplierHotel[] {
    return hotels.map(
      (hotel) =>
        ({
          ...hotel,
          supplier: "VAX",
          supplierHotelId: hotel.id,
          rooms: hotel.rooms.map((room) => ({
            ...room,
            totalPrice: new Decimal(room.totalPrice),
            pricePerPerson: room.pricePerPerson ? new Decimal(room.pricePerPerson) : null,
          })),
        }) satisfies ISupplierHotel,
    );
  }

  private getSessionId(username: string, arc: string): string {
    return `vax_${arc}_${username}`;
  }

  private async restoreSession(username: string, arc: string): Promise<boolean> {
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
      this.sessionTTL,
    );
  }

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

  private buildLoginFormData(
    credentials: VaxLoginCredentials,
    tokens: { viewState: string; viewStateGenerator: string; eventValidation: string },
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

  private async login(): Promise<VaxLoginResponse> {
    try {
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

      const setCookieHeaders = response.headers["set-cookie"];
      if (setCookieHeaders) {
        this.cookieJar.setCookies(setCookieHeaders);
      }

      const isRedirect = response.status >= 300 && response.status < 400;
      const redirectUrl = response.headers["location"];

      if (isRedirect && redirectUrl?.includes("vaxvacationaccess.com")) {
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

        await this.saveSession();

        return {
          success: true,
          redirectUrl,
          sessionCookies: this.session.cookies,
        };
      }

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

  private isLoggedIn(): boolean {
    return this.session !== null;
  }

  private async ensureLoggedIn(): Promise<void> {
    if (!this.isLoggedIn()) {
      await this.login();
    }
  }

  private async parseSearchHtml(html: string): Promise<VaxHotelResult[]> {
    try {
      const $ = cheerio.load(html);
      const hotels: VaxHotelResult[] = [];

      const headerText = $(".avail-content-wrap").text();
      const checkInMatch = headerText.match(/Check-in\s*-\s*(\d{2}[A-Z]{3}\d{2})/i)?.[1];
      const checkOutMatch = headerText.match(/Check-out\s*-\s*(\d{2}[A-Z]{3}\d{2})/i)?.[1];
      if (!checkInMatch || !checkOutMatch) {
        throw new Error("Failed to extract check-in/check-out dates from search results");
      }
      const checkIn = this.parseVaxShortDate(checkInMatch);
      const checkOut = this.parseVaxShortDate(checkOutMatch);

      const hotelRows = $("tr.room-repeater-visibility");

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

  private parseHotelSection($hotelRow: cheerio.Cheerio<any>, checkIn: Date, checkOut: Date): VaxHotelResult | null {
    try {
      const $hotelInfo = $hotelRow.find(".hotel-info-wrapper");
      if (!$hotelInfo.length) {
        return null;
      }

      const nameLink = $hotelInfo.find('a[onclick*="HotelInformation/Default.aspx"]').first();
      const name = nameLink.text().trim();

      if (!name) {
        return null;
      }

      const onclickAttr = nameLink.attr("onclick") || "";
      const hotelIdMatch = onclickAttr.match(/HotelId=(\d+)/);
      const hotelId = hotelIdMatch?.[1] || "";

      const vendorMatch = onclickAttr.match(/VendorCode=([^&]+)/);
      const vendor = vendorMatch?.[1] || "";

      const remoteSourceMatch = onclickAttr.match(/RemoteSourceCode=([^&]+)/);
      const remoteSource = remoteSourceMatch?.[1] || "";

      const destCodeMatch = onclickAttr.match(/DestinationCode=([^&]+)/);
      const destinationCode = destCodeMatch?.[1] || "";

      const rating = $hotelInfo.find(".rating_ST").length;

      let tripAdvisorRating: number | null = null;
      let tripAdvisorReviews: number | null = null;
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

      const location = $hotelInfo.find(".hotel-location-info").first().text().trim();

      let distanceFromAirport: number | null = null;
      const distanceText = $hotelInfo.find("strong:contains('miles')").text();
      const distanceMatch = distanceText.match(/([\d.]+) miles/);
      if (distanceMatch?.[1]) {
        distanceFromAirport = parseFloat(distanceMatch[1]);
      }

      let cleaningBadge: string | null = null;
      const badgeButton = $hotelRow.find("button.cleaning-badge");
      if (badgeButton.length > 0) {
        const onclickAttr = badgeButton.attr("onclick") || "";
        const badgeMatch = onclickAttr.match(/program=([^&'"]+)/);
        if (badgeMatch?.[1]) {
          cleaningBadge = badgeMatch[1];
        }
      }

      const rooms = this.parseRoomOptions($hotelRow);

      const result: VaxHotelResult = {
        id: hotelId,
        name,
        rating,
        location,
        rooms,
        vendor,
        remoteSource,
        destinationCode,
        tripAdvisorRating,
        tripAdvisorReviews,
        cleaningBadge,
        distanceFromAirport,
        checkIn,
        checkOut,
      };

      return result;
    } catch (error) {
      console.warn("Error parsing hotel section:", error);
      return null;
    }
  }

  private parseRoomOptions($hotelRow: cheerio.Cheerio<any>): VaxRoomOption[] {
    const rooms: VaxRoomOption[] = [];

    let $nextRow = $hotelRow.next();

    while ($nextRow.length > 0 && !$nextRow.hasClass("room-repeater-visibility")) {
      const $roomWrapper = $nextRow.find(".hotel-avail-room-type-wrap");

      if ($roomWrapper.length > 0) {
        try {
          const roomLink = $roomWrapper.find('a[onclick*="room="]').first();
          const onclickAttr = roomLink.attr("onclick") || "";
          const roomCodeMatch = onclickAttr.match(/room=([^&]+)/);
          const code = roomCodeMatch?.[1] || "";
          const name = roomLink.text().trim();

          if (!name) {
            $nextRow = $nextRow.next();
            continue;
          }

          const priceText = $nextRow.find(".hotel-room-col-3 strong").first().text();
          const priceMatch = priceText.match(/\$([0-9,]+\.\d{2})/);
          const totalPrice = priceMatch?.[1] ? parseFloat(priceMatch[1].replace(/,/g, "")) : 0;

          let pricePerPerson: number | null = null;
          const perPersonText = $nextRow.find(".hotel-room-col-3").text();
          const perPersonMatch = perPersonText.match(/\$([0-9,]+\.\d{2}) per person/);
          if (perPersonMatch?.[1]) {
            pricePerPerson = parseFloat(perPersonMatch[1].replace(/,/g, ""));
          }

          const addedValues: string[] = [];
          $nextRow.find(".added-value-wrap button.link").each((_i: number, btn: any) => {
            const value = cheerio.load(btn).root().text().trim();
            if (value) {
              addedValues.push(value);
            }
          });

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
            pricePerPerson,
            addedValues,
            valueIndicators,
          };

          rooms.push(room);
        } catch (err) {
          console.warn("Failed to parse room option:", err);
        }
      }

      $nextRow = $nextRow.next();
    }

    return rooms;
  }

  private parseVaxShortDate(dateStr: string): Date {
    if (!dateStr) throw new Error("Invalid date string");

    try {
      const dayMatch = dateStr.match(/^(\d{2})/);
      const monthMatch = dateStr.match(/[A-Z]{3}/);
      const yearMatch = dateStr.match(/(\d{2})$/);

      if (!dayMatch || !monthMatch || !yearMatch) {
        return new Date(dateStr);
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

      return new Date(`${year}-${month}-${day}`);
    } catch (e) {
      console.error("Error parsing VAX short date:", e);
      return new Date(dateStr);
    }
  }

  private async extractLiveVendors(): Promise<ISupplierVendor[]> {
    const searchUrl = "https://new.www.vaxvacationaccess.com/Search/Default.aspx";
    const searchGetResponse = await this.client.get<string>(searchUrl, {
      headers: {
        Cookie: this.cookieJar.getCookieHeader(),
      },
    });
    const html = searchGetResponse.data;
    return this.extractVendors(html);
  }

  private async extractVendors(html: string): Promise<ISupplierVendor[]> {
    const $ = cheerio.load(html);
    const vendors: ISupplierVendor[] = [];

    const vendorSelect = $(
      "#ctl00_ctl00_ContentPlaceHolder_ContentPlaceHolder_scncc_ctl00_NavigationRepeater_ctl00_ctl00_SearchComponents_scc_rt_vendor",
    );

    if (!vendorSelect.length) {
      throw new Error("Vendor select element not found in HTML");
    }

    vendorSelect.find("option").each((_index, element) => {
      const $option = $(element);
      const code = $option.attr("value");
      const name = $option.text().trim();

      if (code && name) {
        vendors.push({
          id: code,
          name,
        });
      }
    });

    const sortedVendors = vendors.sort((a, b) => a.id.localeCompare(b.id));
    const vendorsPath = new URL("./vendors.json", import.meta.url).pathname;
    await Bun.write(vendorsPath, JSON.stringify(sortedVendors, null, 2));
    return sortedVendors;
  }

  private async getOriginMarkets(
    vendorCode: string,
    packageCode: string,
    destinationCode = "",
    filterOrgs = "",
    plCode = "",
  ): Promise<ISupplierMarket[]> {
    if (!this.isLoggedIn()) {
      throw new Error("Not logged in. Please call login() first.");
    }

    const url = "https://new.www.vaxvacationaccess.com/Search/RestoolConfiguration.asmx/GetOriginMarkets";

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
      id: market.C,
      name: market.D,
    }));
  }

  private async getDestinationMarkets(
    vendorCode: string,
    packageCode: string,
    originCode = "",
    regionCode: string | null = null,
    themeIds: string | null = null,
    specialId: string | null = null,
    filterDests = "",
    plCode = "",
    supplierCode = "",
  ): Promise<ISupplierMarket[]> {
    if (!this.isLoggedIn()) {
      throw new Error("Not logged in. Please call login() first.");
    }

    try {
      const url = "https://new.www.vaxvacationaccess.com/Search/RestoolConfiguration.asmx/GetDestinationMarkets";

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
        id: market.C,
        name: market.D,
      }));
    } catch (error) {
      console.error("Error fetching destination markets:", error);
      throw error;
    }
  }
}
