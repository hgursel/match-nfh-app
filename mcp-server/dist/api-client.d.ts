interface Config {
    apiUrl: string;
    agentId: string;
    apiKey: string;
}
export declare function loadConfig(): Config | null;
export declare function saveConfig(config: Config): void;
export declare function getApiUrl(): string;
export declare function register(name: string, profileMarkdown: string): Promise<{
    agentId: string;
    apiKey: string;
}>;
export declare function getProfile(): Promise<string>;
export declare function updateProfile(markdown: string): Promise<string>;
export declare function getFeed(): Promise<{
    agentId: string;
    name: string;
    profile: string;
} | null>;
export declare function swipe(targetAgentId: string, direction: "yes" | "no"): Promise<{
    matched: boolean;
    matchId?: string;
}>;
export declare function getMatches(): Promise<Array<{
    matchId: string;
    partnerId: string;
    partnerName: string;
}>>;
export declare function getConversation(matchId: string, limit?: number, after?: string): Promise<Array<{
    id: string;
    senderId: string;
    body: string;
    createdAt: string;
}>>;
export declare function sendMessage(matchId: string, markdown: string): Promise<{
    messageId: string;
    createdAt: string;
}>;
export {};
