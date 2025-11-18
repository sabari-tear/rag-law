import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  // We deliberately don't throw here to allow build to succeed; the API route will
  // surface a clear error if the key is missing at runtime.
  console.warn("[openai] OPENAI_API_KEY is not set. The legal chatbot API will not work without it.");
}

export const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured in the environment.");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}
