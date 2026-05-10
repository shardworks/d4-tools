"use client";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface ScreenshotLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt: string;
}

/**
 * Full-viewport image lightbox. Built on the Dialog primitive (D3).
 * Esc and backdrop-click dismissal come from Radix defaults.
 * Focus is trapped inside the modal while open (Radix behavior).
 * Image is displayed at natural resolution or scaled-to-fit-viewport,
 * whichever is smaller (D5).
 */
export function ScreenshotLightbox({ open, onOpenChange, src, alt }: ScreenshotLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-none w-screen h-screen p-0 border-none rounded-none bg-black/90 flex items-center justify-center"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain"
          style={{ maxWidth: "100vw", maxHeight: "100vh" }}
        />
      </DialogContent>
    </Dialog>
  );
}
