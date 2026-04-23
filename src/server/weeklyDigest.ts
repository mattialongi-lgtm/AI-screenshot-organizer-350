export type DigestScreenshot = {
  category?: string | null;
  created_at?: string | null;
  entities?: any;
  summary?: string | null;
  upload_date?: string | null;
};

export type WeeklyDigest = {
  subject: string;
  headline: string;
  intro: string;
  highlights: string[];
  metrics: {
    amounts: number;
    categoriesFound: number;
    dates: number;
    orderIds: number;
    screenshotsAnalyzed: number;
    topCategory: {
      count: number;
      name: string;
    };
    totalAmount: string;
    urls: number;
  };
  rediscovery: {
    reason: string;
    summary: string;
  } | null;
};

function parseAmount(raw: string) {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function formatCurrency(total: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(total);
}

function titleCase(input: string) {
  return input
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeEntities(value: any) {
  if (!value) {
    return { amounts: [], dates: [], order_ids: [], urls: [] };
  }

  if (typeof value === "string") {
    try {
      return normalizeEntities(JSON.parse(value));
    } catch {
      return { amounts: [], dates: [], order_ids: [], urls: [] };
    }
  }

  return {
    amounts: Array.isArray(value.amounts) ? value.amounts : [],
    dates: Array.isArray(value.dates) ? value.dates : [],
    order_ids: Array.isArray(value.order_ids) ? value.order_ids : Array.isArray(value.orderIds) ? value.orderIds : [],
    urls: Array.isArray(value.urls) ? value.urls : [],
  };
}

export function buildWeeklyDigest(firstName: string, screenshots: DigestScreenshot[]): WeeklyDigest {
  const totalsByCategory = new Map<string, number>();
  let amountCount = 0;
  let dateCount = 0;
  let urlCount = 0;
  let orderIdCount = 0;
  let totalAmount = 0;

  for (const screenshot of screenshots) {
    const category = screenshot.category?.trim() || "Other";
    totalsByCategory.set(category, (totalsByCategory.get(category) ?? 0) + 1);

    const entities = normalizeEntities(screenshot.entities);
    amountCount += entities.amounts.length;
    dateCount += entities.dates.length;
    urlCount += entities.urls.length;
    orderIdCount += entities.order_ids.length;
    totalAmount += entities.amounts.reduce((sum: number, amount: string) => sum + parseAmount(amount), 0);
  }

  const [topCategoryName, topCategoryCount] =
    [...totalsByCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["Other", 0];

  const rediscoveryCandidate = [...screenshots].reverse().find((item) => {
    const summary = item.summary?.toLowerCase() ?? "";
    return summary.includes("invoice") || summary.includes("receipt") || summary.includes("confirmation");
  });

  return {
    subject: "Your ScreenSort weekly summary is ready",
    headline: `${screenshots.length} screenshots organized this week`,
    intro: `Hi ${firstName}, here is your weekly ScreenSort summary.`,
    highlights: [
      `Top category: ${titleCase(topCategoryName)} (${topCategoryCount} screenshots)`,
      `Key entities found: ${amountCount} amounts, ${dateCount} dates, ${urlCount} links, ${orderIdCount} order IDs`,
      `Most useful insight: ScreenSort captured ${amountCount} amount-related items totaling ${formatCurrency(totalAmount)} this week.`,
    ],
    metrics: {
      amounts: amountCount,
      categoriesFound: totalsByCategory.size,
      dates: dateCount,
      orderIds: orderIdCount,
      screenshotsAnalyzed: screenshots.length,
      topCategory: {
        count: topCategoryCount,
        name: titleCase(topCategoryName),
      },
      totalAmount: formatCurrency(totalAmount),
      urls: urlCount,
    },
    rediscovery: rediscoveryCandidate?.summary
      ? {
          reason: "This older screenshot looks relevant again based on your recent capture patterns.",
          summary: rediscoveryCandidate.summary,
        }
      : null,
  };
}

export function renderWeeklyDigestHtml(digest: WeeklyDigest) {
  const rediscoveryHtml = digest.rediscovery
    ? `
      <div style="background:#eef4ff;border:1px solid #cddcff;border-radius:16px;padding:18px;margin:24px 0;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1f5eff;">Rediscovery</div>
        <div style="font-size:18px;font-weight:700;color:#142033;margin-top:8px;">${escapeHtml(digest.rediscovery.summary)}</div>
        <p style="margin:8px 0 0;color:#445066;">${escapeHtml(digest.rediscovery.reason)}</p>
      </div>
    `
    : "";

  return `
  <!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:24px;background:#eef3f8;font-family:Segoe UI,Arial,sans-serif;color:#142033;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d8e1ee;border-radius:24px;overflow:hidden;">
        <div style="padding:28px;border-bottom:1px solid #d8e1ee;background:linear-gradient(135deg,#ffffff 0%,#f6f9ff 100%);">
          <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1f5eff;">ScreenSort Weekly Digest</div>
          <h1 style="margin:12px 0 8px;font-size:30px;line-height:1.1;">${escapeHtml(digest.headline)}</h1>
          <p style="margin:0;color:#5f6f85;">${escapeHtml(digest.intro)}</p>
        </div>
        <div style="padding:28px;">
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            <div style="background:#f8fbff;border:1px solid #d8e1ee;border-radius:16px;padding:16px;">
              <div style="color:#5f6f85;font-size:13px;">Screenshots</div>
              <div style="font-size:28px;font-weight:700;">${digest.metrics.screenshotsAnalyzed}</div>
            </div>
            <div style="background:#f8fbff;border:1px solid #d8e1ee;border-radius:16px;padding:16px;">
              <div style="color:#5f6f85;font-size:13px;">Top category</div>
              <div style="font-size:28px;font-weight:700;">${escapeHtml(digest.metrics.topCategory.name)}</div>
            </div>
            <div style="background:#f8fbff;border:1px solid #d8e1ee;border-radius:16px;padding:16px;">
              <div style="color:#5f6f85;font-size:13px;">Tracked value</div>
              <div style="font-size:28px;font-weight:700;">${escapeHtml(digest.metrics.totalAmount)}</div>
            </div>
          </div>
          <h2 style="margin:28px 0 12px;font-size:18px;">Your highlights</h2>
          <ul style="padding-left:20px;margin:0;color:#243247;">
            ${digest.highlights.map((item) => `<li style="margin:0 0 10px;">${escapeHtml(item)}</li>`).join("")}
          </ul>
          ${rediscoveryHtml}
          <h2 style="margin:28px 0 12px;font-size:18px;">What you can do next</h2>
          <ul style="padding-left:20px;margin:0;color:#243247;">
            <li style="margin:0 0 10px;">Filter screenshots by amount to review expenses in one view</li>
            <li style="margin:0 0 10px;">Search your library by concept, not filename</li>
            <li style="margin:0;">Ask AI chat what expenses or confirmations you captured this week</li>
          </ul>
        </div>
      </div>
    </body>
  </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
