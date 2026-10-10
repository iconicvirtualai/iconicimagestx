import { BUSINESS_CONTACT } from "@shared/businessContact";

/**
 * The public contact block, rendered as the official one-line string.
 * Phone and email stay linked; the visible text is BUSINESS_CONTACT.line.
 */
export function PublicContactLine({
  className,
  linkClassName,
}: {
  className?: string;
  linkClassName?: string;
}) {
  return (
    <p className={className} data-testid="public-contact-line">
      {BUSINESS_CONTACT.address}
      {" | "}
      <a href={BUSINESS_CONTACT.phoneHref} className={linkClassName}>
        {BUSINESS_CONTACT.phoneDisplay}
      </a>
      {" | "}
      <a href={BUSINESS_CONTACT.emailHref} className={linkClassName}>
        {BUSINESS_CONTACT.email}
      </a>
    </p>
  );
}
