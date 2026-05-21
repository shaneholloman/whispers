"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RecordingBasics } from "./RecordingBasics";
import { useTRPC } from "@/trpc/client";
import { RecordingMinutesLeft } from "./RecordingMinutesLeft";
import { useTogetherApiKey } from "./TogetherApiKeyProvider";
import useLocalStorage from "./hooks/useLocalStorage";
import { AudioWaveform } from "./AudioWaveform";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useS3Upload } from "next-s3-upload";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLimits } from "./hooks/useLimits";

interface RecordingModalProps {
  onClose: () => void;
  title?: string;
}

// Extend the Window interface
declare global {
  interface Window {
    currentMediaRecorder: MediaRecorder | undefined;
    currentStream: MediaStream | undefined;
  }
}

export function RecordingModal({ onClose }: RecordingModalProps) {
  const [language, setLanguage] = useLocalStorage("language", "en");

  const { uploadToS3 } = useS3Upload();

  const {
    recording,
    paused,
    audioBlob,
    analyserNode,
    duration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
  } = useAudioRecording();

  const trpc = useTRPC();
  const { apiKey } = useTogetherApiKey();
  const isBYOK = !!apiKey;

  const { isLoading, minutesData } = useLimits();

  const router = useRouter();
  const transcribeMutation = useMutation(
    trpc.whisper.transcribeFromS3.mutationOptions()
  );

  const queryClient = useQueryClient();

  const [isProcessing, setIsProcessing] = useState<
    "idle" | "uploading" | "transcribing"
  >("idle");
  const [pendingSave, setPendingSave] = useState(false);

  // Check microphone permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((result) => {
          // setMicPermission(result.state as "granted" | "denied" | "prompt");
          result.onchange = () => {};
        });
    }
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSaveRecording = async () => {
    if (!audioBlob) {
      toast.error("No audio to save. Please record something first.");
      return;
    }
    setIsProcessing("uploading");
    try {
      // Upload to S3
      const file = new File([audioBlob], `recording-${Date.now()}.webm`, {
        type: "audio/webm",
      });
      const { url } = await uploadToS3(file);
      // Call tRPC mutation

      setIsProcessing("transcribing");

      const { id } = await transcribeMutation.mutateAsync({
        audioUrl: url,
        language,
        durationSeconds: duration,
      });
      // Invalidate dashboard query
      await queryClient.invalidateQueries({
        queryKey: trpc.whisper.listWhispers.queryKey(),
      });
      // Redirect to whisper page
      router.push(`/whispers/${id}`);
    } catch (err) {
      toast.error("Failed to transcribe audio. Please try again.");
      setIsProcessing("idle");
    }
  };

  // Wait for audioBlob to be set after stopping before saving
  useEffect(() => {
    if (pendingSave && audioBlob) {
      setPendingSave(false);
      handleSaveRecording();
    }
  }, [pendingSave, audioBlob]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[392px] !p-0 border border-gray-200 rounded-tl-xl rounded-tr-xl bg-white overflow-hidden gap-0"
      >
        <DialogHeader className="p-0">
          <DialogTitle className="sr-only">Recording Modal</DialogTitle>
          <DialogDescription className="sr-only">
            Record audio directly in your browser
          </DialogDescription>
        </DialogHeader>

        {isProcessing !== "idle" ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
            <img
              src="/loading.svg"
              alt="Loading"
              className="w-8 h-8 animate-spin"
            />
            <p className="text-gray-500">
              {isProcessing === "uploading"
                ? "Uploading audio recording"
                : "Transcribing audio..."}
              <span className="animate-pulse">...</span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full bg-white">
            {!recording ? (
              <>
                <RecordingBasics
                  language={language}
                  setLanguage={setLanguage}
                />
              </>
            ) : (
              <div className="flex flex-row gap-8 mt-8">
                {/* X Button: Reset recording */}
                <button
                  className="size-10 bg-[#FFEEEE] p-2.5 rounded-xl cursor-pointer"
                  onClick={resetRecording}
                  type="button"
                  aria-label="Reset recording"
                >
                  <img src="/X.svg" className="size-5 min-w-5" />
                </button>

                <div className="flex flex-col gap-1">
                  <p className="text-base text-center text-[#364153]">
                    {formatTime(duration)}
                  </p>
                  <AudioWaveform
                    analyserNode={analyserNode}
                    isPaused={paused}
                  />
                </div>

                {/* Pause/Resume Button */}
                {paused ? (
                  <button
                    className="size-10 bg-[#1E2939] p-2.5 rounded-xl cursor-pointer"
                    onClick={resumeRecording}
                    type="button"
                    aria-label="Resume recording"
                  >
                    <img src="/microphone.svg" className="size-5 min-w-5" />
                  </button>
                ) : (
                  <button
                    className="size-10 bg-[#1E2939] p-2.5 rounded-xl cursor-pointer"
                    onClick={pauseRecording}
                    type="button"
                    aria-label="Pause recording"
                  >
                    <img src="/pause.svg" className="size-5 min-w-5" />
                  </button>
                )}
              </div>
            )}

            <Button
              className={cn(
                recording ? "bg-[#6D1414]" : "bg-[#101828]",
                "w-[352px] h-[86px] rounded-xl flex flex-row gap-3 items-center justify-center my-5"
              )}
              onClick={async () => {
                if (recording) {
                  stopRecording();
                  setPendingSave(true);
                } else {
                  startRecording();
                }
              }}
              disabled={isProcessing !== "idle"}
            >
              {recording ? (
                <>
                  <img
                    src="/stop.svg"
                    className="min-w-7 min-h-7 size-7 text-white"
                  />
                  <p>Stop Recording</p>
                </>
              ) : (
                <img
                  src="/microphone.svg"
                  className="min-w-9 min-h-9 size-9 text-white"
                />
              )}
            </Button>

            {!recording && (
              <div className="w-full flex flex-col py-3 px-5 border-t border-gray-200">
                {isLoading ? (
                  <span className="text-sm text-[#4a5565]">Loading...</span>
                ) : (
                  <RecordingMinutesLeft
                    minutesLeft={
                      isBYOK ? Infinity : minutesData?.remaining ?? 0
                    }
                  />
                )}
                {/* No Save button, processing is automatic */}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
