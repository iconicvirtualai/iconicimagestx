import { PUBLIC_PROCESSING_NOTE } from "@shared/publicRequests";

export function ProcessingFeeNote({ className }: { className?: string }) {
  return (
    <p className={className} data-testid="processing-fee-note">
      {PUBLIC_PROCESSING_NOTE}
    </p>
  );
}
