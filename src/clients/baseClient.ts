import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";

export interface BaseClientConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  withCredentials?: boolean;
}

export function createBaseClient(config?: BaseClientConfig): AxiosInstance {
  const defaultConfig: AxiosRequestConfig = {
    timeout: 30000,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    },
    ...config,
  };

  const client = axios.create(defaultConfig);

  // Request interceptor for logging/debugging
  client.interceptors.request.use(
    (config) => {
      // Add request timestamp for debugging
      (config as any).metadata = { startTime: Date.now() };
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor for logging/error handling
  client.interceptors.response.use(
    (response: AxiosResponse) => {
      const duration = Date.now() - (response.config as any).metadata?.startTime;
      console.log(`[${response.config.method?.toUpperCase()}] ${response.config.url} - ${response.status} (${duration}ms)`);
      return response;
    },
    (error) => {
      if (error.response) {
        console.error(`[ERROR] ${error.response.status} - ${error.response.config.url}`);
      } else if (error.request) {
        console.error(`[ERROR] No response received - ${error.config?.url}`);
      } else {
        console.error(`[ERROR] Request setup failed: ${error.message}`);
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export class CookieJar {
  private cookies: Map<string, string> = new Map();

  setCookies(setCookieHeaders: string | string[]): void {
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    headers.forEach((header) => {
      const [cookiePair] = header.split(";");
      const [name, value] = cookiePair?.split("=") || [];
      if (name && value) {
        this.cookies.set(name.trim(), value.trim());
      }
    });
  }

  setCookiesFromResponse(response: AxiosResponse): void {
    const setCookie = response.headers["set-cookie"];
    if (setCookie) {
      this.setCookies(setCookie);
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  clear(): void {
    this.cookies.clear();
  }
}
