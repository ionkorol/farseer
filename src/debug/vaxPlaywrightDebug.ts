import { chromium, type Browser, type Page } from "playwright";
import { config } from "../utils/settings.js";
import { ResponseStorage } from "../utils/responseStorage.js";

/**
 * VAX Playwright Debugger
 *
 * This script uses Playwright to investigate the actual VAX website behavior
 * and compare it with our axios-based implementation.
 *
 * It will:
 * 1. Navigate to VAX login page
 * 2. Extract form structure and ViewState tokens
 * 3. Attempt login with real credentials
 * 4. Capture all network requests
 * 5. Test search functionality
 * 6. Save screenshots and HTML for comparison
 */

interface NetworkLog {
  url: string;
  method: string;
  status?: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  postData?: string;
}

class VaxPlaywrightDebugger {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private networkLogs: NetworkLog[] = [];
  private responseStorage = new ResponseStorage();

  async initialize(): Promise<void> {
    console.log("Launching browser...");
    this.browser = await chromium.launch({
      headless: false, // Set to true to run in background
      slowMo: 500, // Slow down actions for visibility
    });

    this.page = await this.browser.newPage();

    // Set up network logging
    this.page.on("request", (request) => {
      const postData = request.postData();
      const log: NetworkLog = {
        url: request.url(),
        method: request.method(),
        requestHeaders: request.headers(),
        responseHeaders: {},
        ...(postData && { postData }),
      };
      this.networkLogs.push(log);
    });

    this.page.on("response", (response) => {
      const log = this.networkLogs.find((l) => l.url === response.url() && !l.status);
      if (log) {
        log.status = response.status();
        log.responseHeaders = response.headers();
      }
    });

    console.log("✓ Browser initialized");
  }

  async debugLoginPage(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Investigating Login Page");
    console.log("=".repeat(60));

    const loginUrl = "https://login.www.vaxvacationaccess.com/default.aspx";
    console.log(`Navigating to: ${loginUrl}`);

    await this.page.goto(loginUrl, { waitUntil: "networkidle" });
    console.log("✓ Page loaded");

    // Take screenshot
    await this.page.screenshot({
      path: ".responses/vax_login_page.png",
      fullPage: true,
    });
    console.log("✓ Screenshot saved: .responses/vax_login_page.png");

    // Get page HTML
    const html = await this.page.content();
    await this.responseStorage.saveResponse("playwright_login_page", html);
    console.log("✓ HTML saved");

    // Extract form fields
    console.log("\nForm Analysis:");
    console.log("-".repeat(60));

    const formFields = await this.page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      return inputs.map((input) => ({
        name: input.name,
        id: input.id,
        type: input.type,
        value: input.value.substring(0, 50), // Truncate long values
      }));
    });

    console.log("Input fields found:");
    formFields.forEach((field) => {
      console.log(`  • ${field.name || field.id} (${field.type})`);
      if (field.value && field.type === "hidden") {
        console.log(`    Value: ${field.value.substring(0, 100)}...`);
      }
    });

    // Check for ViewState
    const viewState = await this.page
      .$eval('input[name="__VIEWSTATE"]', (el) => (el as HTMLInputElement).value)
      .catch(() => null);

    const viewStateGenerator = await this.page
      .$eval('input[name="__VIEWSTATEGENERATOR"]', (el) => (el as HTMLInputElement).value)
      .catch(() => null);

    const eventValidation = await this.page
      .$eval('input[name="__EVENTVALIDATION"]', (el) => (el as HTMLInputElement).value)
      .catch(() => null);

    console.log("\nASP.NET ViewState tokens:");
    console.log(
      `  __VIEWSTATE: ${viewState ? "Found (" + viewState.length + " chars)" : "Not found"}`,
    );
    console.log(`  __VIEWSTATEGENERATOR: ${viewStateGenerator || "Not found"}`);
    console.log(
      `  __EVENTVALIDATION: ${eventValidation ? "Found (" + eventValidation.length + " chars)" : "Not found"}`,
    );
  }

  async debugLogin(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Testing Login Flow");
    console.log("=".repeat(60));

    const credentials = {
      arc: config.vax.arc,
      username: config.vax.username,
      password: config.vax.password,
    };

    console.log(`Logging in as: ${credentials.username} (ARC: ${credentials.arc})`);

    // Fill in the form
    await this.page.fill(
      'input[name="ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$Arc"]',
      credentials.arc,
    );
    await this.page.fill(
      'input[name="ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$UserName"]',
      credentials.username,
    );
    await this.page.fill(
      'input[name="ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$Password"]',
      credentials.password,
    );

    console.log("✓ Form filled");

    // Clear network logs to focus on login request
    this.networkLogs = [];

    // Click login button
    console.log("Clicking login button...");
    await this.page.click(
      'input[name="ctl00$ContentPlaceHolder$ctl00$ctl01$LoginCtrl$LoginButton"]',
    );

    // Wait for navigation or response
    try {
      await this.page.waitForNavigation({ timeout: 10000 });
      console.log("✓ Navigation occurred");
    } catch {
      console.log("⚠ No navigation detected (might be AJAX)");
    }

    // Take screenshot after login
    await this.page.screenshot({
      path: ".responses/vax_after_login.png",
      fullPage: true,
    });
    console.log("✓ Screenshot saved: .responses/vax_after_login.png");

    // Save HTML after login
    const html = await this.page.content();
    await this.responseStorage.saveResponse("playwright_after_login", html);

    // Analyze login result
    console.log("\nLogin Result:");
    console.log("-".repeat(60));
    console.log(`Current URL: ${this.page.url()}`);
    console.log(`Page title: ${await this.page.title()}`);

    // Check for success indicators
    const isRedirected = !this.page.url().includes("login.www.vaxvacationaccess.com");
    console.log(`Redirected away from login: ${isRedirected ? "Yes ✓" : "No ✗"}`);

    // Print network activity
    console.log("\nNetwork Activity During Login:");
    console.log("-".repeat(60));
    this.networkLogs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.method} ${log.url}`);
      console.log(`   Status: ${log.status || "pending"}`);
      if (log.postData) {
        console.log(`   POST Data: ${log.postData.substring(0, 100)}...`);
      }
    });
  }

  async debugSearch(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Testing Search Flow");
    console.log("=".repeat(60));

    const searchUrl =
      "https://new.www.vaxvacationaccess.com/Search/ContentIFrameRestoolVAX.aspx?AnchorStore=none";
    console.log(`Navigating to: ${searchUrl}`);

    try {
      await this.page.goto(searchUrl, { waitUntil: "networkidle", timeout: 15000 });
      console.log("✓ Search page loaded");

      // Take screenshot
      await this.page.screenshot({
        path: ".responses/vax_search_page.png",
        fullPage: true,
      });
      console.log("✓ Screenshot saved: .responses/vax_search_page.png");

      // Save HTML
      const html = await this.page.content();
      await this.responseStorage.saveResponse("playwright_search_page", html);

      // Check for iframes
      const frames = this.page.frames();
      console.log(`\nFrames found: ${frames.length}`);
      frames.forEach((frame, index) => {
        console.log(`  ${index + 1}. ${frame.url()}`);
      });

      // Try to find search controls
      console.log("\nSearch Controls:");
      console.log("-".repeat(60));

      const packageTypeSelect = await this.page.$('select[name*="package"]');
      if (packageTypeSelect) {
        console.log("✓ Package type selector found");
        const options = await packageTypeSelect.$$eval("option", (opts) =>
          opts.map((opt) => ({ value: opt.value, text: opt.textContent })),
        );
        console.log("  Options:", options);
      } else {
        console.log("✗ Package type selector not found");
      }

      const vendorSelect = await this.page.$('select[name*="vendor"]');
      if (vendorSelect) {
        console.log("✓ Vendor selector found");
      } else {
        console.log("✗ Vendor selector not found");
      }
    } catch (error) {
      console.error("✗ Error accessing search page:", error);
      console.log("This might indicate authentication issues or the URL structure has changed");
    }
  }

  async printSummary(): Promise<void> {
    console.log("\n" + "=".repeat(60));
    console.log("DEBUG SUMMARY");
    console.log("=".repeat(60));

    console.log("\nFiles Generated:");
    console.log("  • .responses/vax_login_page.png - Login page screenshot");
    console.log("  • .responses/vax_after_login.png - After login screenshot");
    console.log("  • .responses/vax_search_page.png - Search page screenshot");
    console.log("  • .responses/playwright_*.html - Page HTML snapshots");

    console.log("\nNext Steps:");
    console.log("  1. Review screenshots to verify page structure");
    console.log("  2. Compare HTML with current vaxClient implementation");
    console.log("  3. Check network logs for correct request format");
    console.log("  4. Update selectors and form data if needed");

    console.log("\n" + "=".repeat(60));
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log("\n✓ Browser closed");
    }
  }
}

// Main execution
async function main() {
  const vaxDebug = new VaxPlaywrightDebugger();

  try {
    await vaxDebug.initialize();
    await vaxDebug.debugLoginPage();
    await vaxDebug.debugLogin();
    await vaxDebug.debugSearch();
    await vaxDebug.printSummary();
  } catch (error) {
    console.error("\n✗ Fatal error:", error);
  } finally {
    await vaxDebug.cleanup();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { VaxPlaywrightDebugger };
