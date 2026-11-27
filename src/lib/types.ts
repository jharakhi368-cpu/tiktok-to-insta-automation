/** JSON-serialised shapes the client receives (dates arrive as strings). */

export type VideoDTO = {
  id: string;
  title: string;
  thumb: string;
  origin: string;
  sourceRef: string | null;
  assetUrl: string | null;
  durationSec: number;
  status: string;
  caption: string;
  coverFrame: number;
  coverImage: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  igMediaId: string | null;
  publishMode: string;
  firstComment: boolean;
  shareToStory: boolean;
  error: string | null;
  createdAt: string;
};

export type Env = {
  bot: boolean;
  polling: boolean;
  botError: string | null;
  botHandle: string;
  instagram: boolean;
  scheduler: boolean;
  schedulerError: string | null;
  uptimeMs: number;
  tz: string;
};
