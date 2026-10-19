const MERGE = /\{([A-Za-z]+)(?:\|([^}]*))?\}/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applyMerge(template: string, values: Record<string, string>): string {
  return template.replace(MERGE, (full, key: string, fallback: string | undefined) => {
    const value = values[key];
    if (value) return key === "UnsubscribeUrl" ? value : escapeHtml(value);
    if (fallback !== undefined) return escapeHtml(fallback);
    return full;
  });
}

export function mergeValues(contact: {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
}, unsubscribeUrl: string): Record<string, string> {
  return {
    FirstName: contact.firstName || "",
    LastName: contact.lastName || "",
    Email: contact.email || "",
    Company: contact.company || "",
    UnsubscribeUrl: unsubscribeUrl,
  };
}

export const MARKETING_POSTAL_ADDRESS = "Iconic Images, 26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380";

export function withUnsubscribeFooter(html: string, url: string): string {
  const link = `<p style="margin-top:24px;font-size:12px;color:#667085;">${MARKETING_POSTAL_ADDRESS}. <a href="{UnsubscribeUrl}" clicktracking="off">Unsubscribe</a>.</p>`;
  let merged = html.includes("{UnsubscribeUrl}") ? html : `${html}\n${link}`;
  if (!merged.includes("26410 Oakridge Dr")) merged = `${merged}\n${link}`;
  return applyMerge(merged, { UnsubscribeUrl: url });
}
