// src/components/auth/LogoutButton.tsx
"use client";

import React, { useState } from "react";
import { account } from "@/lib/appwrite"; // Import Appwrite account service
import { toast } from "react-toastify";
import { LogOut } from "lucide-react";

interface LogoutButtonProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

export default function LogoutButton({
  className,
  iconClassName,
  textClassName,
}: LogoutButtonProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsLoggingOut(true);

    try {
      await account.deleteSession("current"); // Delete current Appwrite session
      toast.success("Logged out successfully!");
      window.location.href = "/"; // Redirect to login page
    } catch (err: any) {
      console.error("Appwrite Logout error:", err);
      toast.error("Logout failed: " + (err.message || "Unknown error"));
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      className={`crancy-btn logout-button-style ${className || ""}`}
      disabled={isLoggingOut}
      aria-label={isLoggingOut ? "Logging out..." : "Logout"}
    >
      <LogOut className={`icon ${iconClassName || ""}`} />
      <span className={`menu-bar__name ${textClassName || ""}`}>
        {isLoggingOut ? "Logging out..." : "Logout"}
      </span>
    </button>
  );
}
