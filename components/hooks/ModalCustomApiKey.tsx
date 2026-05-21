"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useState, useRef, useEffect } from "react";
import { useTogetherApiKey } from "../TogetherApiKeyProvider";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { RecordingMinutesLeft } from "../RecordingMinutesLeft";

export const ModalCustomApiKey = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const isOpen = searchParams.get("customKey") === "true";

  const { apiKey, setApiKey } = useTogetherApiKey();
  const [togetherApiKey, setTogetherApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const trpc = useTRPC();
  const isBYOK = !!apiKey;

  const { data: minutesData, isLoading: isMinutesLoading } = useQuery(
    trpc.limit.getMinutesLeft.queryOptions()
  );

  useEffect(() => {
    setTogetherApiKey(apiKey || "");
  }, [apiKey]);

  // Remove customKey from the URL
  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("customKey");
    const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
    router.push(newUrl);
  }, [router, pathname, searchParams]);

  const validateAndSaveApiKey = async (apiKey: string) => {
    setIsValidating(true);
    try {
      const response = await fetch("/api/validate-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey }),
      });

      if (response.ok) {
        setApiKey(apiKey);
        toast.success("API key validated and saved!");
        return true;
      } else {
        const errorData = await response.json();
        const errorMessage =
          errorData.message ||
          `API key validation failed with status: ${response.status}`;
        toast.error(errorMessage);

        if (errorMessage.startsWith("Invalid API key")) {
          setApiKey("");
          setTogetherApiKey("");
        }
        return false;
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleApiKeyChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTogetherApiKey(value);

    if (value.length === 0) {
      setApiKey("");
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      await validateAndSaveApiKey(value);
    }, 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-[392px] w-full p-0 border border-gray-200 rounded-2xl bg-white flex flex-col items-center justify-center gap-0"
        showCloseButton={false}
      >
        <DialogHeader className="w-full flex flex-col items-center p-0">
          <div className="flex items-center justify-start w-full p-5 relative border-b border-gray-200">
            <img
              src="/square-logo.svg"
              alt="Logo"
              className="w-5 h-5 rounded-[3px] mr-2"
            />
            <DialogTitle className="text-base font-semibold text-[#101828]">
              Together AI API
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex flex-col items-center w-full px-5 py-6 gap-3">
          <div className="w-full flex flex-col gap-2 relative">
            <p className="text-base font-medium text-[#101828] text-left">
              Add your{" "}
              <a
                href="https://togetherai.link/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Together AI
              </a>{" "}
              API key:
            </p>
            <div className="relative w-full">
              <input
                type="password"
                className="w-full h-9 flex items-center overflow-hidden rounded-lg bg-white border border-[#99a1af] px-3 text-base placeholder:text-[#99a1af] text-[#4a5565] pr-10"
                placeholder="API Key"
                value={togetherApiKey}
                onChange={handleApiKeyChange}
                autoComplete="off"
              />
              {isValidating && (
                <img
                  src="/loading.svg"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
                  alt="Validating API key..."
                  aria-busy="true"
                />
              )}
            </div>
          </div>
          <ul className="w-full flex flex-col gap-2 mt-2 list-disc px-5">
            <li className="text-sm text-[#4a5565] text-left">
              Visit{" "}
              <a
                href="https://togetherai.link/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#101828] underline"
              >
                together.ai
              </a>{" "}
              and sign up for free
            </li>
            <li className="text-sm text-[#4a5565] text-left">
              Copy your API key and paste it above
            </li>
          </ul>
          <div className="w-full flex flex-col gap-3 mt-4">
            <a
              href="https://togetherai.link/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-center items-center w-full h-10 gap-2 px-[33px] py-2.5 rounded-lg bg-[#101828] cursor-pointer"
            >
              <span className="text-base font-semibold text-white">
                Get your API key
              </span>
              <svg
                width={21}
                height={20}
                viewBox="0 0 21 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                preserveAspectRatio="none"
              >
                <path
                  d="M8.65888 7.184C8.24467 7.184 7.90888 6.84822 7.90888 6.434C7.90888 6.01979 8.24467 5.684 8.65888 5.684L14.3157 5.684C14.73 5.684 15.0657 6.01979 15.0657 6.434L15.0657 12.0909C15.0657 12.5051 14.73 12.8409 14.3157 12.8409C13.9015 12.8409 13.5657 12.5051 13.5657 12.0909L13.5657 8.24466L6.71434 15.0961C6.42145 15.389 5.94657 15.389 5.65368 15.0961C5.36079 14.8032 5.36079 14.3283 5.65368 14.0354L12.5051 7.184L8.65888 7.184Z"
                  fill="white"
                />
              </svg>
            </a>
            <button
              className="flex justify-center items-center w-full h-10 gap-2 px-[33px] py-2.5 rounded-lg border border-[#d1d5dc] cursor-pointer"
              type="button"
              onClick={handleClose}
            >
              <span className="text-base font-medium text-[#364153]">
                Dismiss
              </span>
            </button>
          </div>
        </div>
        <div className="w-full flex justify-start px-5 py-3 mt-auto border-t border-gray-200">
          {isMinutesLoading ? (
            <span className="text-sm text-[#4a5565]">Loading...</span>
          ) : (
            <RecordingMinutesLeft
              minutesLeft={isBYOK ? Infinity : minutesData?.remaining ?? 0}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
