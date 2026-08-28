const BASE_URL = "https://zernio.com/api/v1";

export async function zernioRequest(apiKey: string, path: string, init?: RequestInit) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error || body.message || `Zernio respondeu ${response.status}`));
  return body;
}

export type ZernioConversation = {
  id: string; platform: string; accountId: string; participantId: string;
  participantName?: string; participantPicture?: string; lastMessage?: string;
  updatedTime?: string; unreadCount?: number;
};

export type ZernioMessage = {
  id: string; conversationId: string; accountId: string; platform: string;
  message?: string; senderId?: string; senderName?: string;
  direction: "incoming" | "outgoing"; createdAt?: string;
  attachments?: { type?: string; url?: string; refreshUrl?: string }[];
};
