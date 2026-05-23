import { t } from "../init";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { protectedProcedure } from "../init";
import { limitMinutes } from "@/lib/limits";
import {
  togetherBaseClientWithKey,
  togetherVercelAiClient,
} from "@/lib/apiClients";
import { generateText } from "ai";
import { toFile } from "together-ai";

const AUDIO_TO_TEXT_MODEL = "nvidia/parakeet-tdt-0.6b-v3";

const OLD_AUDIO_TO_TEXT_MODEL = "openai/whisper-large-v3";

export const whisperRouter = t.router({
  listWhispers: protectedProcedure.query(async ({ ctx }) => {
    const whispers = await prisma.whisper.findMany({
      where: { userId: ctx.auth.userId },
      orderBy: { createdAt: "desc" },
    });
    // Map to dashboard shape
    return whispers.map((w) => ({
      id: w.id,
      title: w.title,
      content: w.fullTranscription,
      preview:
        w.fullTranscription.length > 80
          ? w.fullTranscription.slice(0, 80) + "..."
          : w.fullTranscription,
      timestamp: w.createdAt.toISOString(),
      // duration: ... // If you want to add duration, you can extend the model or calculate from audioTracks
    }));
  }),
  transcribeFromS3: protectedProcedure
    .input(
      z.object({
        audioUrl: z.string(),
        whisperId: z.string().optional(),
        language: z.string().optional(),
        durationSeconds: z.number().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Enforce minutes limit
      const minutes = Math.ceil(input.durationSeconds / 60);

      console.log("decreasing of minutes", minutes);

      const limitResult = await limitMinutes({
        clerkUserId: ctx.auth.userId,
        isBringingKey: !!ctx.togetherApiKey,
        minutes,
      });

      if (!limitResult.success) {
        throw new Error("You have exceeded your daily audio minutes limit.");
      }

      let transcription: string;

      try {
        const res = await togetherBaseClientWithKey(
          ctx.togetherApiKey
        ).audio.transcriptions.create({
          file: input.audioUrl,
          // @ts-ignore
          model: AUDIO_TO_TEXT_MODEL,
          language: input.language || "en",
        });
        transcription = res.text as string;
      } catch (err: any) {
        // Workaround for a TogetherAI backend bug where some audio files fail
        // during the URL-based splitting pipeline with a 500. Fetch the file
        // from S3 and upload it directly as a File object instead.
        if (err?.status !== 500) {
          throw err;
        }

        const audioRes = await fetch(input.audioUrl);
        if (!audioRes.ok) {
          throw new Error(
            `Failed to fetch audio from S3 for fallback transcription: ${audioRes.status}`
          );
        }

        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        const contentType =
          audioRes.headers.get("content-type") || "audio/mpeg";
        const extension =
          contentType === "audio/mp4"
            ? ".m4a"
            : contentType === "audio/wav"
            ? ".wav"
            : contentType === "audio/webm"
            ? ".webm"
            : ".mp3";

        const audioFile = await toFile(audioBuffer, `audio${extension}`, {
          type: contentType,
        });

        const res = await togetherBaseClientWithKey(
          ctx.togetherApiKey
        ).audio.transcriptions.create({
          file: audioFile,
          // @ts-ignore
          model: AUDIO_TO_TEXT_MODEL,
          language: input.language || "en",
        });

        transcription = res.text as string;
      }

      // Generate a title from the transcription (first 8 words or fallback)
      const { text: title } = await generateText({
        prompt: `Generate a title for the following transcription with max of 10 words/80 characters: 
        ${transcription}
        
        Only return the title, nothing else, no explanation and no quotes or followup.
        `,
        model: togetherVercelAiClient(ctx.togetherApiKey)(
          "meta-llama/Llama-3.3-70B-Instruct-Turbo"
        ),
        maxOutputTokens: 10,
      });

      const whisperId = input.whisperId || uuidv4();

      if (input.whisperId) {
        // Add AudioTrack to existing Whisper
        const whisper = await prisma.whisper.findUnique({
          where: { id: input.whisperId },
        });
        if (!whisper) throw new Error("Whisper not found");
        if (whisper.userId !== ctx.auth.userId) throw new Error("Unauthorized");
        // Create new AudioTrack
        await prisma.audioTrack.create({
          data: {
            fileUrl: input.audioUrl,
            partialTranscription: transcription,
            whisperId: input.whisperId,
            language: input.language,
          },
        });
        // Append to fullTranscription
        await prisma.whisper.update({
          where: { id: input.whisperId },
          data: {
            fullTranscription: whisper.fullTranscription + "\n" + transcription,
          },
        });
      } else {
        // Create new Whisper and first AudioTrack
        await prisma.whisper.create({
          data: {
            id: whisperId,
            title: title.slice(0, 80),
            userId: ctx.auth.userId,
            fullTranscription: transcription,
            audioTracks: {
              create: [
                {
                  fileUrl: input.audioUrl,
                  partialTranscription: transcription,
                  language: input.language,
                },
              ],
            },
          },
        });
      }
      return { id: whisperId };
    }),
  getWhisperWithTracks: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const whisper = await prisma.whisper.findUnique({
        where: { id: input.id },
        include: {
          audioTracks: true,
          transformations: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!whisper) throw new Error("Whisper not found");
      if (whisper.userId !== ctx.auth.userId) throw new Error("Unauthorized");
      return whisper;
    }),
  updateFullTranscription: protectedProcedure
    .input(z.object({ id: z.string(), fullTranscription: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Only allow the owner to update
      const whisper = await prisma.whisper.findUnique({
        where: { id: input.id },
      });
      if (!whisper) throw new Error("Whisper not found");
      if (whisper.userId !== ctx.auth.userId) throw new Error("Unauthorized");
      const updated = await prisma.whisper.update({
        where: { id: input.id },
        data: { fullTranscription: input.fullTranscription },
      });
      return { id: updated.id, fullTranscription: updated.fullTranscription };
    }),
  updateTitle: protectedProcedure
    .input(z.object({ id: z.string(), title: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Only allow the owner to update
      const whisper = await prisma.whisper.findUnique({
        where: { id: input.id },
      });
      if (!whisper) throw new Error("Whisper not found");
      if (whisper.userId !== ctx.auth.userId) throw new Error("Unauthorized");
      const updated = await prisma.whisper.update({
        where: { id: input.id },
        data: { title: input.title },
      });
      return { id: updated.id, title: updated.title };
    }),
  deleteWhisper: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Only allow the owner to delete
      const whisper = await prisma.whisper.findUnique({
        where: { id: input.id },
      });
      if (!whisper) throw new Error("Whisper not found");
      if (whisper.userId !== ctx.auth.userId) throw new Error("Unauthorized");

      // Delete all related Transformations first
      await prisma.transformation.deleteMany({
        where: { whisperId: input.id },
      });

      // Delete all related AudioTracks
      await prisma.audioTrack.deleteMany({
        where: { whisperId: input.id },
      });

      // Now delete the Whisper
      await prisma.whisper.delete({
        where: { id: input.id },
      });
      return { id: input.id };
    }),
});
