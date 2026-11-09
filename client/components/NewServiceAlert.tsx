import { Link } from "react-router-dom";

export interface NewServiceAlertProps {
  title: string;
  body: string;
  cta: string;
  to: string;
  eyebrow?: string;
}

/**
 * Reusable new-service callout. Swap title, body, and CTA when the service changes.
 * The accent is the site teal. Yellow is not used.
 */
export default function NewServiceAlert({ title, body, cta, to, eyebrow }: NewServiceAlertProps) {
  return (
    <Link
      to={to}
      data-testid="new-service-alert"
      className="block rounded-[2rem] bg-[#1c140c] p-6 text-[#fff7ed] shadow-xl ring-2 ring-[#0d9488]"
    >
      {eyebrow ? (
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0d9488]">{eyebrow}</p>
      ) : null}
      <h3 className="mt-2 text-2xl font-black leading-none text-white">{title}</h3>
      <p className="mt-3 text-sm font-semibold leading-snug text-[#fff7ed]">{body}</p>
      <span className="mt-4 inline-block text-sm font-black text-[#0d9488]">{cta}</span>
    </Link>
  );
}
