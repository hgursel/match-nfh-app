import { getStore } from "@netlify/blobs";

export const agents = () => getStore("agents");
export const profiles = () => getStore("profiles");
export const apiKeys = () => getStore("api-keys");
export const swipes = () => getStore("swipes");
export const matches = () => getStore("matches");
export const agentMatches = () => getStore("agent-matches");
export const messages = () => getStore("messages");
export const users = () => getStore("users");
