import React, { Suspense } from "react";
import ObeyAuthCard from "@/components/ObeyAuthCard";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#dfe3e8] dark:bg-black flex flex-col items-center justify-center p-6">
      <Suspense fallback={<div className="text-zinc-500 font-semibold text-sm">Loading security portal...</div>}>
        <ObeyAuthCard mode="sign-up" />
      </Suspense>
    </div>
  );
}
