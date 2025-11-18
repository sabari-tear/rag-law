import { getOpenAIClient, CHAT_MODEL } from "./openai";
import { loadLegalDocs, LegalDoc } from "./dataset";

export type SourceSnippet = {
  id: string;
  act: string;
  section?: string;
  title?: string;
  snippet: string;
};

export type ChatResult = {
  answer: string;
  sources: SourceSnippet[];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function scoreDocument(doc: LegalDoc, queryTokens: string[]): number {
  if (!doc.text) return 0;
  const haystack = doc.text.toLowerCase();
  let matches = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      matches += 1;
    }
  }

  if (matches === 0) return 0;
  return matches / queryTokens.length;
}

export async function answerLegalQuestion(question: string): Promise<ChatResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new Error("Question cannot be empty.");
  }

  const docs = await loadLegalDocs();
  if (!docs.length) {
    return {
      answer:
        "I could not load the legal dataset on the server. Please check that the CSV files are present in the dataset/ folder.",
      sources: [],
    };
  }

  const queryTokens = tokenize(trimmed);
  if (!queryTokens.length) {
    return {
      answer:
        "I could not interpret your question. Please rephrase it using a bit more detail about the situation or law.",
      sources: [],
    };
  }

  const scored: { doc: LegalDoc; score: number }[] = docs
    .map((doc) => ({ doc, score: scoreDocument(doc, queryTokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (!scored.length) {
    return {
      answer:
        "I could not find any matching sections in the legal dataset for this question. Please try rephrasing or mention the specific act or section if you know it.",
      sources: [],
    };
  }

  const topDocs = scored.map((s) => s.doc);

  const contextBlocks = topDocs.map((doc) => {
    const headerParts = [doc.act, doc.section && `Section ${doc.section}`, doc.title]
      .filter(Boolean)
      .join(" - ");
    return `${headerParts}\n\n${doc.text}`;
  });

  const context = contextBlocks.join("\n\n---\n\n");

  const client = getOpenAIClient();

  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "You are an expert Indian legal assistant (LawBot) specialising in IPC, BNS, BSA, and CrPC. You must answer strictly based on the legal CONTEXT provided. Always explain in simple language, clearly cite the relevant acts and section numbers, and include a short practical guidance section. If the context does not contain an answer, say that explicitly instead of guessing. End every answer with a short disclaimer that this is not formal legal advice.",
      },
      {
        role: "user",
        content: `User question: ${trimmed}\n\nCONTEXT FROM LEGAL SECTIONS:\n${context}`,
      },
    ],
  });

  const answer = completion.choices?.[0]?.message?.content?.trim();

  const sources: SourceSnippet[] = topDocs.map((doc) => ({
    id: doc.id,
    act: doc.act,
    section: doc.section,
    title: doc.title,
    snippet: doc.text.slice(0, 280),
  }));

  return {
    answer:
      answer ||
      "I was unable to generate a detailed answer from the dataset and model. Please try asking your question again with more context.",
    sources,
  };
}
