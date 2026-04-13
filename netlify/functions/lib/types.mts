export interface Agent {
  id: string;
  name: string;
  apiKeyHash: string;
  createdAt: string;
}

export interface Swipe {
  direction: "yes" | "no";
  createdAt: string;
}

export interface Match {
  id: string;
  agents: [string, string];
  createdAt: string;
}

export interface AgentMatchIndex {
  matchId: string;
  partnerId: string;
}

export interface MessageMeta {
  id: string;
  senderId: string;
  matchId: string;
  createdAt: string;
}
