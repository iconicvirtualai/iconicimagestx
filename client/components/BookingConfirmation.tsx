import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bookingFollowUp, bookingOrderNumber, type BookingSubmitResult } from "@/lib/bookingFollowUp";

export function BookingConfirmation({
  result,
  onBookAnother,
}: {
  result: BookingSubmitResult;
  onBookAnother: () => void;
}) {
  const orderNumber = bookingOrderNumber(result);
  const note = bookingFollowUp(result);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto w-full max-w-lg min-w-0 space-y-6 py-8 text-center sm:space-y-8 sm:py-16"
    >
      <div className="relative mx-auto h-20 w-20 sm:h-28 sm:w-28">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 12, stiffness: 200 }}
          className="relative z-10 flex h-full w-full items-center justify-center rounded-[2rem] bg-black shadow-xl"
        >
          <Check className="h-10 w-10 stroke-[3] text-white sm:h-12 sm:w-12" />
        </motion.div>
      </div>
      <div className="min-w-0 space-y-4 px-1">
        <h2 className="text-[2rem] font-black uppercase leading-none tracking-tight text-black sm:text-4xl">YOU'RE IN</h2>
        {orderNumber ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Order number</p>
            <p
              data-order-number=""
              className="mt-1 break-all text-2xl font-black leading-tight tracking-tight text-black sm:text-3xl"
            >
              {orderNumber}
            </p>
          </div>
        ) : null}
        <p className="mx-auto max-w-md text-sm font-medium leading-relaxed text-neutral-500 [overflow-wrap:anywhere] [text-wrap:balance]">
          {note}
        </p>
      </div>
      <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Button asChild className="h-auto w-full max-w-full whitespace-normal rounded-2xl bg-black px-5 py-4 text-center text-sm font-black text-white shadow-xl hover:bg-gray-800 sm:w-auto sm:px-10 sm:py-6 sm:hover:scale-105">
          <a href="/">Back to Home</a>
        </Button>
        <Button
          type="button"
          onClick={onBookAnother}
          variant="outline"
          className="h-auto w-full max-w-full whitespace-normal rounded-2xl border-2 border-black px-5 py-4 text-center text-sm font-black text-black shadow-md sm:w-auto sm:px-10 sm:py-6 sm:hover:scale-105"
        >
          Book Another Service
        </Button>
      </div>
    </motion.div>
  );
}
