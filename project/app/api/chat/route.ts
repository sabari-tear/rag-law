import { NextResponse } from "next/server";
import { answerLegalQuestion } from "@/lib/rag";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = (body?.question ?? "") as string;

    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 },
      );
    }

    const result = await answerLegalQuestion(question);

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    console.error("/api/chat error", error);
    return NextResponse.json(
      { error: "Failed to process your question. Please try again." },
      { status: 500 },
    );
  }
}
