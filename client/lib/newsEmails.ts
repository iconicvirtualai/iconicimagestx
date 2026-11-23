const htmlFiles = import.meta.glob("/content/news/*/email.html", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export function bundledNewsEmail(slug: string): string {
  const key = Object.keys(htmlFiles).find((item) => item.includes(`/content/news/${slug}/email.html`));
  return key ? htmlFiles[key] : "";
}
