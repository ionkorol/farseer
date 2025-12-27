import * as fs from "node:fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ResponseStorage {
  private storageDir: string;

  constructor() {
    this.storageDir = join(__dirname, "../../.responses");
  }

  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.access(this.storageDir);
    } catch {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  private generateFilename(methodName: string): string {
    const ts = new Date();
    const dateStr = `${ts.getFullYear()}-${ts.getMonth() + 1}-${ts.getDate()}`;

    const sanitizedMethod = methodName
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .toLowerCase();

    return `${sanitizedMethod}_${dateStr}.html`;
  }

  async saveResponse(methodName: string, response: string): Promise<string> {
    await this.ensureStorageDir();

    const filename = this.generateFilename(methodName);
    const filepath = join(this.storageDir, filename);

    let content = response;
    const metadataComment = `<!--
===========================================
Response Debug Information
===========================================
Method: ${methodName}
Timestamp: ${new Date().toISOString()}
===========================================
-->

`;
    content = metadataComment + response;

    await fs.writeFile(filepath, content, "utf-8");
    return filepath;
  }

  async readResponse(methodName: string): Promise<string | null> {
    const filename = this.generateFilename(methodName);
    const filepath = join(this.storageDir, filename);
    const file = Bun.file(filepath);
    if (!(await file.exists())) {
      return null;
    }
    const content = await file.text();
    return content;
  }

  async deleteResponse(filename: string): Promise<void> {
    const filepath = join(this.storageDir, filename);
    await fs.unlink(filepath);
  }
}
