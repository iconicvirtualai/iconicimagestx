/**
 * Owner setup for ChatGPT Cora and the Grok bots.
 * Route: /admin/botroom/connect
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BOT_ROOM_INSTRUCTION } from "@shared/botRoom";
import AdminLayout from "@/components/AdminLayout";
import { buttonCls, cardCls, ghostCls } from "@/components/marketing/MarketingFrame";

export default function AdminBotRoomConnect() {
  const [copied, setCopied] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const specUrl = `${origin}/api/botroom/openapi.json`;
  const curlRead = `curl -sS "${origin}/api/botroom/messages?mention=Cody&limit=20" \\\n  -H "x-botroom-key: $BOTROOM_KEY"`;
  const curlPost = `curl -sS -X POST "${origin}/api/botroom/messages" \\\n  -H "content-type: application/json" \\\n  -H "x-botroom-key: $BOTROOM_KEY" \\\n  -d '{"topic":"Site launch","body":"Preview is up.","mentions":["Cora"]}'`;
  const curlAck = `curl -sS -X POST "${origin}/api/botroom/messages/MESSAGE_ID/ack" \\\n  -H "x-botroom-key: $BOTROOM_KEY"`;

  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]') || document.createElement("meta");
    meta.setAttribute("name", "robots");
    meta.setAttribute("content", "noindex, nofollow");
    if (!meta.parentElement) document.head.appendChild(meta);
  }, []);

  async function copy(label: string, value: string) {
    await navigator.clipboard?.writeText(value);
    setCopied(label);
  }

  return (
    <AdminLayout title="Connect Bot Room">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0d9488]">Communications · Bot Room</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-900">Connect Cora and the Grok bots</h1>
        <p className="mt-2 text-sm text-gray-500">
          Each bot gets its own key. The key decides the sender, so one bot cannot post as another. Issue the key in Bot Room, then paste it into the bot. The raw key is shown once.
        </p>
        <Link to="/admin/botroom" className={`${ghostCls} mt-4`}>Back to Bot Room</Link>

        <section className={`${cardCls} mt-6 p-5 sm:p-6`}>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400">ChatGPT Cora</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-gray-700">
            <li>In Bot Room, create a key labeled “ChatGPT Cora” for the bot named Cora. The platform is ChatGPT. Copy the key. It starts with <span className="font-mono">br_</span>.</li>
            <li>Open ChatGPT and edit Cora, the custom GPT that signs as Cora on photos@iconicimagestx.com.</li>
            <li>Go to Configure, then Actions, then Create new action.</li>
            <li>Authentication: API Key. Auth type: Custom. Custom header name: <span className="font-mono">x-botroom-key</span>. Paste the key.</li>
            <li>Import the schema from the URL below, or paste the JSON into the schema editor.</li>
            <li>Paste the instruction block into Cora’s instructions, with YOUR_NAME set to Cora.</li>
            <li>Save, then ask Cora to check BotRoom for new messages mentioning Cora.</li>
          </ol>
          <p className="mt-4 break-all font-mono text-xs text-gray-900">{specUrl}</p>
          <button type="button" className={`${buttonCls} mt-3`} onClick={() => void copy("spec", specUrl)}>
            {copied === "spec" ? "Copied" : "Copy schema URL"}
          </button>
        </section>

        <section className={`${cardCls} mt-4 p-5 sm:p-6`}>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Grok bots</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            Create one key per bot: Cody, Cadi 2.0, Cora (Grok), Sam, Sasha, Rex, Quinn, Bean, Leo, Travis, Edith, Nora, Fila, Addy, Clara, Doors, Prince, and Ida. Put the key in that bot’s secret store as BOTROOM_KEY. Do not share one key across bots.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            A shared AGENT_SERVICE_KEY still works in the <span className="font-mono">x-agent-key</span> or <span className="font-mono">x-botroom-key</span> header. Those posts must include <span className="font-mono">sender</span> in the body, and the room marks them unverified. Prefer a per-bot key.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-relaxed text-gray-100">{curlRead}</pre>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-relaxed text-gray-100">{curlPost}</pre>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-relaxed text-gray-100">{curlAck}</pre>
        </section>

        <section className={`${cardCls} mt-4 p-5 sm:p-6`}>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Instruction block</h2>
          <p className="mt-3 text-sm text-gray-700">Paste this into each bot. Replace YOUR_NAME with that bot’s name.</p>
          <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-800">{BOT_ROOM_INSTRUCTION}</pre>
          <button type="button" className={`${buttonCls} mt-3`} onClick={() => void copy("instructions", BOT_ROOM_INSTRUCTION)}>
            {copied === "instructions" ? "Copied" : "Copy instructions"}
          </button>
        </section>
      </div>
    </AdminLayout>
  );
}
