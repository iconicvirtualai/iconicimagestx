/**
 * Optional public list of sent Admin Campaigns.
 * Folders stay the source of truth. A campaign is added only when it opts in
 * with newsSlug and that slug is not already a folder.
 */

import type { MarketingCampaign } from "../../shared/emailMarketing/types.ts";
import {
  type CampaignNewsInput,
  type NewsCard,
  type NewsCategory,
  type NewsIssue,
  newsFilesFromCampaign,
  newsIssuePath,
  publicCampaignCard,
} from "../../shared/news.ts";
import { getMarketingStore } from "../services/marketingStore.ts";

function campaignSource(campaign: MarketingCampaign): CampaignNewsInput {
  const extra = campaign as MarketingCampaign & {
    newsSlug?: unknown;
    newsCategory?: unknown;
    newsSummary?: unknown;
    newsHero?: unknown;
  };
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    subject: campaign.subject,
    preheader: campaign.preheader,
    html: campaign.html,
    sentAt: campaign.sentAt,
    newsSlug: typeof extra.newsSlug === "string" ? extra.newsSlug : "",
    newsCategory: typeof extra.newsCategory === "string" ? extra.newsCategory : "",
    newsSummary: typeof extra.newsSummary === "string" ? extra.newsSummary : "",
    newsHero: typeof extra.newsHero === "string" ? extra.newsHero : "",
  };
}

export async function sentCampaignCards(): Promise<NewsCard[]> {
  try {
    const campaigns = await getMarketingStore().listCampaigns();
    const cards: NewsCard[] = [];
    for (const campaign of campaigns) {
      const card = publicCampaignCard(campaignSource(campaign));
      if (card) cards.push(card);
    }
    return cards;
  } catch (err) {
    console.error("[news] sent campaigns skipped:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function findSentCampaignIssue(category: NewsCategory, slug: string): Promise<NewsIssue | null> {
  try {
    const campaigns = await getMarketingStore().listCampaigns();
    for (const campaign of campaigns) {
      const source = campaignSource(campaign);
      if (!source.newsSlug) continue;
      const files = newsFilesFromCampaign(source);
      if (!files || files.meta.slug !== slug || files.meta.category !== category || !files.meta.heroImage) continue;
      return {
        ...files.meta,
        emailHtml: files.emailHtml,
        path: newsIssuePath(files.meta),
        source: "campaign",
      };
    }
  } catch (err) {
    console.error("[news] campaign issue skipped:", err instanceof Error ? err.message : err);
  }
  return null;
}
