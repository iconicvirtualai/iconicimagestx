export interface VsaiPoll {
  status: string;
  resultUrl?: string | null;
  error?: string;
}

export async function pollVsaiJob(
  read: () => Promise<VsaiPoll>,
  wait: (ms: number) => Promise<void>,
  attempts = 20,
): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const data = await read();
    if (data.status === "completed" && data.resultUrl) return data.resultUrl;
    if (data.status === "failed") throw new Error(data.error || "Virtual staging failed.");
    if (attempt < attempts - 1) await wait(4000);
  }
  throw new Error("Virtual staging is still rendering. Try that frame again in a moment.");
}
