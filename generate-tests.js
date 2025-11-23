import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { chromium } from "playwright";



const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

//parse input file
function parseInputFile() {
    const inputPath = "./input.txt"
    const raw = fs.readFileSync(inputPath, "utf-8");
    const urlMatch = raw.match(/URL:\s*(.*?)\r?\n/i) || raw.match(/URL:\s*(.*)/i);
    const url = urlMatch ? urlMatch[1].trim() : "";
    const criteriaMatch = raw.match(/ACCEPTANCE CRITERIA:\s*([\s\S]+)/i);
    const criteria = criteriaMatch ? criteriaMatch[1].trim() : raw.trim();

  if (!url || !criteria) {
    throw new Error(
      "Could not parse URL and acceptance criteria from input file. Needs 'URL:' and 'ACCEPTANCE CRITERIA:' sections."
    );
  }

  return { url, criteria };
}

async function extractPageMetadata(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log(`Navigating to ${url} ...`);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const info = await page.evaluate(() => {
    const cleanText = (str) =>
      (str || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);

    const inputs = Array.from(
      document.querySelectorAll("input, textarea, select")
    ).map((el) => {
      const labelElem = (el.labels && el.labels[0]) || null;
      const label =
        labelElem?.innerText?.trim() ||
        el.getAttribute("aria-label") ||
        "";

      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        id: el.id || "",
        name: el.getAttribute("name") || "",
        placeholder: el.getAttribute("placeholder") || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        label: cleanText(label),
      };
    });

    const buttons = Array.from(
      document.querySelectorAll(
        "button, [role='button'], input[type='submit'], input[type='button']"
      )
    ).map((el) => {
      const text = el.innerText || el.getAttribute("value") || "";
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        text: cleanText(text),
      };
    });

    const links = Array.from(document.querySelectorAll("a"))
      .slice(0, 50)
      .map((el) => ({
        text: cleanText(el.innerText),
        href: el.getAttribute("href") || "",
      }));

    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3")
    ).map((el) => ({
      level: el.tagName.toLowerCase(),
      text: cleanText(el.innerText),
    }));

    return { inputs, buttons, links, headings };
  });

  await browser.close();
  return info;
}

async function generatePlaywrightTests(url, criteria, pageMetadata) {
  const elementsJson = JSON.stringify(pageMetadata, null, 2).slice(0, 8000);
  const input = `
    URL:
    ${url}

    ACCEPTANCE CRITERIA:
    ${criteria}

    PAGE ELEMENTS (JSON SUMMARY):
    ${elementsJson}

    Generate a JavaScript Playwright test file (.spec.js) that tests the page.

    Requirements:
    - Use Playwright Test (@playwright/test) with "test" and "expect".
    - Create one "test()" per acceptance criterion, with a clear test name.
    - Use resilient selectors based on this JSON: getByRole, getByLabel, getByPlaceholder, getByText, etc.
    - Start each test with "await page.goto('${url}');".
    - Add helpful comments explaining each logical step.
    - If any selector is uncertain or not present in the JSON, add a clear TODO comment so a human can fix it.
    - Do NOT include any explanations or markdown, only the JavaScript code of the test file.
`.trim();

  const response = await client.responses.create({
    model: "gpt-4o-mini", 
    instructions:
      "You are generating Playwright tests.",
    input,
  });

  let code = response.output_text;
  if (!code || typeof code !== "string") {
    throw new Error("No code returned from the model.");
  }

 code = code.trim();

  if (code.startsWith("```")) {
    let firstNewline = code.indexOf("\n");
    if (firstNewline !== -1) {
      code = code.slice(firstNewline + 1);
    }
  }

  if (code.endsWith("```")) {
    code = code.slice(0, code.lastIndexOf("```"));
  }

  return code.trim();
}

async function main() {
  const { url, criteria } = parseInputFile();

  console.log("Parsed from input:");
  console.log(" URL: ", url);
  console.log(" Criteria:\n", criteria.split("\n").map((l) => "  " + l).join("\n"));

  console.log("\n Crawling page with Playwright to collect element metadata...");
  const metadata = await extractPageMetadata(url);

  console.log("Metadata collected. Inputs:", metadata.inputs.length,
              "Buttons:", metadata.buttons.length);

  console.log("\n Calling OpenAI to generate Playwright tests...");
  const testFileContent = await generatePlaywrightTests(url, criteria, metadata);

  const outPath = "./generated.spec.ts";
  fs.writeFileSync(outPath, testFileContent, "utf-8");

  console.log(`\n Playwright tests generated and saved to ${outPath}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
