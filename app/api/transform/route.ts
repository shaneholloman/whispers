import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { streamText } from "ai";
import { togetherVercelAiClient } from "@/lib/apiClients";
import { RECORDING_TYPES } from "@/lib/utils";
import { getAuth } from "@clerk/nextjs/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { whisperId, typeName } = body;
  // Auth
  const auth = getAuth(req);
  if (!auth || !auth.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }
  // Optionally get Together API key from header
  const apiKey = req.headers.get("TogetherAPIToken") || undefined;

  // Find whisper
  const whisper = await prisma.whisper.findUnique({ where: { id: whisperId } });
  if (!whisper) {
    return new Response(JSON.stringify({ error: "Whisper not found" }), {
      status: 404,
    });
  }

  // Create transformation in DB
  const transformation = await prisma.transformation.create({
    data: {
      whisperId,
      typeName,
      text: "",
      isGenerating: true,
    },
  });

  // Prepare prompt
  const typeFullName =
    RECORDING_TYPES.find((t) => t.value === typeName)?.name || typeName;

  const prompt = `
  You are a helpful assistant. You will be given a transcription of an audio recording and you will generate a ${typeFullName} based on the transcription with markdown formatting. 
  Only output the generation itself, with no introductions, explanations, or extra commentary.
  
  The transcription is: ${whisper.fullTranscription}

  ${(() => {
    switch (typeName) {
      case "summary":
        return "Return a summary of the transcription with a maximum of 100 words.";
      case "quick-note":
        return "Return a quick post it style note.";
      case "list":
        return "Return a list of bullet points of the transcription main  points.";
      case "blog":
        return "Return the Markdown of entire blog post with subheadings";
      case "email":
        return "If type is email also generate an email subject line and a short email body with introductory paragraph and a closing paragraph for thanking  the reader for reading.";
      default:
        return "";
    }
  })()}

  Remember to use output language like the input transcription language.

  Do not add phrases like "Based on the transcription" or "Let me know if you'd like me to help with anything else."
  `;

  // Start streaming
  const aiClient = togetherVercelAiClient(apiKey);
  const { textStream } = streamText({
    model: aiClient("meta-llama/Meta-Llama-3-70B-Instruct-Turbo"),
    prompt,
  });

  // Create a ReadableStream to send id first, then stream text
  let fullText = "";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send the id as a JSON object first
      controller.enqueue(
        encoder.encode(JSON.stringify({ id: transformation.id }) + "\n")
      );
      // Stream the text
      for await (const chunk of textStream) {
        fullText += chunk;
        controller.enqueue(encoder.encode(chunk));
      }
      // Update DB at the end
      await prisma.transformation.update({
        where: { id: transformation.id },
        data: { text: fullText, isGenerating: false },
      });
      controller.close();
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache",
    },
  });
}
