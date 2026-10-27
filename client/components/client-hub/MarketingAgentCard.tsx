import type { HubAgentBranding } from "@shared/clientHubSettings";

export function MarketingAgentCard({ agent, title, note }: { agent: HubAgentBranding; title: string; note: string }) {
  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm" data-testid={`marketing-agent-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{title}</p>
      <div className="mt-3 flex items-center gap-3">
        {agent.headshotUrl ? <img src={agent.headshotUrl} alt="" className="h-14 w-14 rounded-full object-cover bg-gray-100" /> : null}
        <div className="min-w-0">
          <h3 className="font-black truncate">{agent.name || "Agent"}</h3>
          <p className="text-xs text-gray-500 truncate">{agent.brokerage}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-3">
        {agent.companyLogoUrl ? <img src={agent.companyLogoUrl} alt="Company logo" className="h-8 w-8 object-contain" /> : null}
        {agent.brokerageLogoUrl ? <img src={agent.brokerageLogoUrl} alt="Brokerage logo" className="h-8 w-8 object-contain" /> : null}
      </div>
      <p className="mt-3 text-sm text-gray-600">
        {[agent.phone, agent.email].filter(Boolean).join(" · ")}
      </p>
      {agent.website ? (
        <a href={agent.website} className="mt-2 inline-flex text-sm font-bold text-[#0d9488]" target="_blank" rel="noreferrer">
          {agent.website.replace(/^https?:\/\//, "")}
        </a>
      ) : null}
      {agent.socials.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {agent.socials.map((item) => (
            <li key={`${item.label}-${item.url}`}>
              <a href={item.url} className="inline-flex rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest" target="_blank" rel="noreferrer">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-gray-500">{note}</p>
    </article>
  );
}
