import * as cheerio from "cheerio";

export function parseAspNetFormHiddenInputs(html: string, formId: string): Record<string, string> {
  const $ = cheerio.load(html);
  const formFields: Record<string, string> = {};
  const form = $(`form#${formId}`);
  form.find("input[type='hidden']").each((_, element) => {
    const name = $(element).attr("name");
    const value = $(element).attr("value") || "";
    if (name) {
      formFields[name] = value;
    }
  });

  return formFields;
}

export function getAspNetFormScriptManagerField(html: string): string | null {
  const $ = cheerio.load(html);

  // Find the script tag containing Sys.WebForms.PageRequestManager._initialize
  let scriptManagerId: string | null = null;

  $("script").each((_, element) => {
    const scriptContent = $(element).html();
    if (scriptContent && scriptContent.includes("Sys.WebForms.PageRequestManager._initialize")) {
      // Extract the first parameter which is the ScriptManager ID
      // Pattern: Sys.WebForms.PageRequestManager._initialize('SCRIPTMANAGER_ID', ...
      const match = scriptContent.match(
        /Sys\.WebForms\.PageRequestManager\._initialize\('([^']+)'/,
      );
      if (match && match[1]) {
        scriptManagerId = match[1];
        return false; // Break the each loop
      }
    }
  });

  return scriptManagerId;
}
