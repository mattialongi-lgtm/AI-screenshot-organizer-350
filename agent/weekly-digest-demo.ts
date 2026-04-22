import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type ScreenshotEntities = {
  dates: string[];
  amounts: string[];
  emails: string[];
  urls: string[];
  phones: string[];
  order_ids: string[];
};

type SampleScreenshot = {
  category: string;
  createdAt: string;
  entities: ScreenshotEntities;
  summary: string;
};

type SampleInput = {
  user: {
    firstName: string;
    persona: string;
  };
  screenshots: SampleScreenshot[];
};

function parseAmount(raw: string) {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function currency(total: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(total);
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const inputPath = path.join(root, "agent", "sample-weekly-digest-data.json");
const outputDir = path.join(root, "agent", "output");
const outputPath = path.join(outputDir, "weekly-digest-demo-output.json");

const raw = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(raw) as SampleInput;

const totalsByCategory = new Map<string, number>();
let amountCount = 0;
let dateCount = 0;
let urlCount = 0;
let orderIdCount = 0;
let totalReceipts = 0;

for (const screenshot of input.screenshots) {
  totalsByCategory.set(
    screenshot.category,
    (totalsByCategory.get(screenshot.category) ?? 0) + 1,
  );

  amountCount += screenshot.entities.amounts.length;
  dateCount += screenshot.entities.dates.length;
  urlCount += screenshot.entities.urls.length;
  orderIdCount += screenshot.entities.order_ids.length;
  totalReceipts += screenshot.entities.amounts.reduce((sum, amount) => sum + parseAmount(amount), 0);
}

const sortedCategories = [...totalsByCategory.entries()].sort((a, b) => b[1] - a[1]);
const [topCategoryName, topCategoryCount] = sortedCategories[0] ?? ["Other", 0];
const rediscovery = input.screenshots.find((item) =>
  item.summary.toLowerCase().includes("invoice"),
);

const output = {
  generatedAt: new Date().toISOString(),
  product: "ScreenSort",
  trigger: "Weekly scheduled digest job for users with screenshot activity in the last 7 days",
  user: input.user,
  metrics: {
    screenshotsAnalyzed: input.screenshots.length,
    categoriesFound: totalsByCategory.size,
    topCategory: {
      name: topCategoryName,
      count: topCategoryCount,
    },
    entities: {
      amounts: amountCount,
      dates: dateCount,
      urls: urlCount,
      orderIds: orderIdCount,
    },
    receiptInsight: {
      receiptCount: amountCount,
      total: currency(totalReceipts),
    },
  },
  rediscovery: rediscovery
    ? {
        reason: "Older screenshot surfaced because it is semantically related to this week's receipt and billing activity.",
        summary: rediscovery.summary,
      }
    : null,
  email: {
    subject: "Your ScreenSort weekly summary is ready",
    headline: `${input.screenshots.length} screenshots organized this week`,
    intro: `Hi ${input.user.firstName}, here is your weekly ScreenSort summary.`,
    highlights: [
      `Top category: ${titleCase(topCategoryName)} (${topCategoryCount} screenshots)`,
      `Key entities found: ${amountCount} amounts, ${dateCount} dates, ${urlCount} links, ${orderIdCount} order IDs`,
      `Most useful insight: You saved ${amountCount} receipt-related amounts totaling ${currency(totalReceipts)} this week.`,
    ],
    nextActions: [
      "Filter screenshots by amount to review expenses in one view",
      "Search your library by concept, not filename",
      "Ask AI chat what expenses or confirmations you captured this week",
    ],
  },
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`Weekly digest demo generated at ${outputPath}`);
console.log(JSON.stringify(output, null, 2));
