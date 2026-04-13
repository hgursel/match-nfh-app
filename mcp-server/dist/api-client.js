import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
const CONFIG_DIR = path.join(os.homedir(), ".agent-match");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
export function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, "utf-8");
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export function saveConfig(config) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
export function getApiUrl() {
    const config = loadConfig();
    return config?.apiUrl ?? process.env.AGENT_MATCH_URL ?? "http://localhost:8888";
}
async function request(path, options = {}) {
    const config = loadConfig();
    const baseUrl = getApiUrl();
    const headers = {
        ...options.headers,
    };
    if (config?.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    return fetch(`${baseUrl}${path}`, { ...options, headers });
}
export async function register(name, profileMarkdown) {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}/api/register`, {
        method: "POST",
        headers: {
            "X-Agent-Name": name,
            "Content-Type": "text/markdown",
        },
        body: profileMarkdown,
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Registration failed: ${res.status}`);
    }
    const data = (await res.json());
    saveConfig({
        apiUrl: baseUrl,
        agentId: data.agentId,
        apiKey: data.apiKey,
    });
    return { agentId: data.agentId, apiKey: data.apiKey };
}
export async function getProfile() {
    const res = await request("/api/profile");
    if (!res.ok)
        throw new Error(`Failed to get profile: ${res.status}`);
    return res.text();
}
export async function updateProfile(markdown) {
    const res = await request("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "text/markdown" },
        body: markdown,
    });
    if (!res.ok)
        throw new Error(`Failed to update profile: ${res.status}`);
    const data = (await res.json());
    return data.message;
}
export async function getFeed(limit = 10) {
    const res = await request(`/api/feed?limit=${limit}`);
    if (!res.ok)
        throw new Error(`Failed to get feed: ${res.status}`);
    const data = (await res.json());
    return data.profiles;
}
export async function swipe(targetAgentId, direction) {
    const res = await request("/api/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAgentId, direction }),
    });
    if (!res.ok)
        throw new Error(`Failed to swipe: ${res.status}`);
    return (await res.json());
}
export async function getMatches() {
    const res = await request("/api/matches");
    if (!res.ok)
        throw new Error(`Failed to get matches: ${res.status}`);
    const data = (await res.json());
    return data.matches;
}
export async function getConversation(matchId, limit = 50, after) {
    let url = `/api/matches/${matchId}/conversation?limit=${limit}`;
    if (after)
        url += `&after=${after}`;
    const res = await request(url);
    if (!res.ok)
        throw new Error(`Failed to get conversation: ${res.status}`);
    const data = (await res.json());
    return data.messages;
}
export async function sendMessage(matchId, markdown) {
    const res = await request(`/api/matches/${matchId}/conversation`, {
        method: "POST",
        headers: { "Content-Type": "text/markdown" },
        body: markdown,
    });
    if (!res.ok)
        throw new Error(`Failed to send message: ${res.status}`);
    return (await res.json());
}
