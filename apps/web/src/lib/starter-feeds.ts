// A small curated list so the first-run empty state is never blank
// (docs/design-ux.md). Mixed English/Norwegian to match the house palate.
export interface StarterFeed {
  title: string;
  url: string;
  description: string;
}

export const STARTER_FEEDS: StarterFeed[] = [
  {
    title: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    description: "Tech and startup link firehose",
  },
  {
    title: "Simon Willison's Weblog",
    url: "https://simonwillison.net/atom/everything/",
    description: "LLMs, Python, and open source — prolific and sharp",
  },
  {
    title: "Daring Fireball",
    url: "https://daringfireball.net/feeds/main",
    description: "John Gruber on Apple and technology",
  },
  {
    title: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    description: "In-depth tech news and reviews",
  },
  {
    title: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    description: "Technology, science, and culture news",
  },
  {
    title: "NRK Nyheter",
    url: "https://www.nrk.no/toppsaker.rss",
    description: "Toppsaker fra NRK",
  },
  {
    title: "xkcd",
    url: "https://xkcd.com/rss.xml",
    description: "A webcomic of romance, sarcasm, math, and language",
  },
  {
    title: "kottke.org",
    url: "https://feeds.kottke.org/main",
    description: "Fine hypertext products since 1998",
  },
];
