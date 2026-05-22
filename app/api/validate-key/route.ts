import { togetherVercelAiClient } from "@/lib/apiClients";
import { generateText } from "ai";
import { getAuth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const auth = getAuth(request);
  if (!auth?.userId) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { apiKey } = await request.json();

  if (!apiKey) {
    return new Response(JSON.stringify({ message: "API key is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const customClient = togetherVercelAiClient(apiKey);
    // Make a simple LLM call to validate the API key
    await generateText({
      model: customClient("moonshotai/Kimi-K2.5"),
      maxOutputTokens: 100,
      messages: [
        {
          role: "user",
          content: "hello",
        },
      ],
    });

    return new Response(JSON.stringify({ message: "API key is valid" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("API key validation failed:", error);
    return new Response(
      JSON.stringify({ message: "API key is invalid", error: error.message }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
