"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/");
        router.refresh();
      }}
    >
      <LogOut aria-hidden />
      Se déconnecter
    </Button>
  );
}
