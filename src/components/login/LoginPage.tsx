"use client";

import React, { useState, useCallback, useEffect } from "react";
import { account, databases } from "@/lib/appwrite"; // Import Appwrite services
import { Query } from "appwrite"; // For Appwrite database queries
import type { Models } from "appwrite"; // Import Models to access Document type

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Eye, EyeOff, Mail, Loader2 } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Interface for user profile data from Appwrite Database, extending Models.Document
interface AppwriteProfile extends Models.Document {
  userId: string; // Appwrite User ID (matches Appwrite's current user $id)
  fullName: string | null;
  officialEmail: string;
  role: string;
  firmId: string | null; // Document ID of the firm (nullable)
}

interface LoginPageProps {
  onLoginSuccess?: (userRole: string, firmId: string | null) => void;
  onLoginError?: (error: string) => void;
  onRedirect?: (path: string) => void;
}

export default function LoginPage({
  onLoginSuccess,
  onLoginError,
  onRedirect,
}: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true); // Set to true initially to check session
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const togglePasswordVisibility = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  // NEW useEffect: Check for active session on component mount
  const checkActiveSession = useCallback(async () => {
    setIsLoading(true); // Ensure loading state is active during check
    setErrorMessage(null); // Clear any previous errors
    try {
      const currentAppwriteUser = await account.get(); // Get the current active session/user data
      console.log(
        "LoginPage: Existing session found for Appwrite User ID:",
        currentAppwriteUser.$id
      );

      // --- CRITICAL FIX 1: Add collectionId to listDocuments ---
      const userProfileResponse =
        await databases.listDocuments<AppwriteProfile>(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID, // <--- ADDED collectionId HERE
          [Query.equal("userId", currentAppwriteUser.$id), Query.limit(1)]
        );

      if (userProfileResponse.documents.length === 0) {
        console.error(
          "LoginPage: User profile document not found for active session ID:",
          currentAppwriteUser.$id
        );
        await account.deleteSession("current");
        setErrorMessage(
          "Your user profile is missing or inaccessible. Please contact support."
        );
        setIsLoading(false);
        return;
      }

      const profileData = userProfileResponse.documents[0];
      const userRole = profileData.role;
      const firmId = profileData.firmId;

      console.log(
        "LoginPage: Session active, fetched profile role:",
        userRole,
        "Firm ID:",
        firmId
      );

      let redirectPath = "/dashboard";
      switch (userRole) {
        case "super_admin":
          redirectPath = "/super-admin/firm-management";
          break;
        case "firm_admin":
          redirectPath = "/locations";
          break;
        default:
          redirectPath = "/dashboard";
          break;
      }
      console.log("LoginPage: Redirecting to:", redirectPath);
      window.location.href = redirectPath;
      return;
    } catch (err: any) {
      console.log(
        "LoginPage: No active session or session invalid:",
        err.message
      );
    } finally {
      setIsLoading(false);
    }
  }, [databases, onRedirect]); // Added databases to dependencies for useCallback

  useEffect(() => {
    checkActiveSession();
  }, [checkActiveSession]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const session = await account.createEmailPasswordSession(email, password);

      console.log(
        "LoginPage: Auth successful, Appwrite User ID:",
        session.userId
      );

      // --- CRITICAL FIX 2: Add collectionId to listDocuments ---
      const userProfileResponse =
        await databases.listDocuments<AppwriteProfile>(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID, // <--- ADDED collectionId HERE
          [Query.equal("userId", session.userId), Query.limit(1)]
        );

      if (userProfileResponse.documents.length === 0) {
        console.error(
          "LoginPage: User profile document not found after login for ID:",
          session.userId
        );
        await account.deleteSession("current");
        const msg = "User profile not found. Please contact support.";
        setErrorMessage(msg);
        onLoginError?.(msg);
        return;
      }

      const profileData = userProfileResponse.documents[0];
      const userRole = profileData.role;
      const firmId = profileData.firmId;

      console.log(
        "LoginPage: Fetched Profile Role:",
        userRole,
        "Firm ID:",
        firmId
      );

      onLoginSuccess?.(userRole, firmId);

      let redirectPath = "/dashboard";
      switch (userRole) {
        case "super_admin":
          redirectPath = "/dashboard/super-admin";
          break;
        case "firm_admin":
          redirectPath = "/dashboard/firm-admin";
          break;
        default:
          redirectPath = "/dashboard";
          break;
      }

      if (onRedirect) {
        onRedirect(redirectPath);
      } else {
        window.location.href = redirectPath;
      }
    } catch (err: any) {
      console.error(
        "LoginPage: Caught unexpected error during login process:",
        err
      );
      let userFacingError = "Login failed. Please check your credentials.";
      if (
        err.code === 400 &&
        err.message.includes(
          "Creation of a session is prohibited when a session is active"
        )
      ) {
        userFacingError = "You are already logged in. Redirecting...";
        console.warn(
          "LoginPage: Attempted login while session active. Re-triggering session check."
        );
        checkActiveSession(); // Re-trigger the session check and redirect
      } else if (err.code === 401) {
        userFacingError = "Invalid email or password.";
      } else if (err.code === 429) {
        userFacingError = "Too many login attempts. Please try again later.";
      } else if (err.message.includes("Network request failed")) {
        userFacingError =
          "Network error. Please check your internet connection.";
      } else {
        userFacingError = err.message || "An unexpected error occurred.";
      }
      setErrorMessage(userFacingError);
      onLoginError?.(userFacingError);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-[#0033A0]" />
        <p className="ml-4 text-gray-700">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col font-sans">
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-16 xl:px-24 lg:pt-20 lg:pb-12">
        <div className="w-full max-w-screen-xl grid grid-cols-1 lg:grid-cols-2 gap-y-16 lg:gap-x-24">
          <div className="flex justify-center lg:justify-start">
            <div className="flex flex-col text-center lg:text-left space-y-6">
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0">
                <img
                  src="/images/secure-place-logo.png"
                  alt="Secure Place Logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="text-gray-800 text-left">
                <h1 className="text-4xl sm:text-5xl font-extrabold leading-normal tracking-tight">
                  Secure
                  <br />
                  Place To
                  <br />
                  Work
                </h1>
              </div>
              <p className="mt-4 text-lg sm:text-xl font-medium text-gray-600 max-w-lg">
                Ensuring safety, fostering peace of mind for your most valuable
                assets.
              </p>
            </div>
          </div>

          <div className="w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end">
            <Card className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8 transform transition-all duration-300 hover:shadow-xl">
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-4xl font-extrabold text-[#0033A0] mb-2">
                  Sign In
                </CardTitle>
                <CardDescription className="text-gray-600 text-lg">
                  Welcome back! Please enter your credentials.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-6">
                  {/* Email Input */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="text-gray-700 font-semibold text-base"
                    >
                      Email address*
                    </Label>
                    <div className="relative">
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                        placeholder="your.email@company.com"
                        required
                        aria-label="Email address"
                        autoComplete="email"
                      />
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="text-gray-700 font-semibold text-base"
                    >
                      Password*
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                        placeholder="••••••••"
                        required
                        aria-label="Password"
                        autoComplete="current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 h-auto p-1 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
                        onClick={togglePasswordVisibility}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Error Message Display */}
                  {errorMessage && (
                    <div className="text-red-600 text-sm font-medium mt-2 animate-fadeIn">
                      {errorMessage}
                    </div>
                  )}

                  {/* Forgot Password Link */}
                  <div className="text-right">
                    <Button
                      variant="link"
                      className="text-blue-600 hover:text-blue-700 hover:underline p-0 h-auto font-normal"
                      onClick={() =>
                        alert(
                          "Forgot password functionality will be implemented."
                        )
                      }
                    >
                      Forgot Password?
                    </Button>
                  </div>

                  {/* Sign In Button */}
                  <Button
                    type="submit"
                    className="w-full bg-[#0033A0] hover:bg-blue-800 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="icon-spin mr-2" /> Signing In...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 py-6 border-t border-gray-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center text-sm text-gray-500 space-y-3 sm:space-y-0">
          <div className="text-center sm:text-left">
            &copy; 2025 Secure Place. All rights reserved.
          </div>
          <div className="flex items-center space-x-2">
            <Mail className="w-4 h-4 text-gray-600" />
            <a
              href="mailto:support@secureplace.com"
              className="hover:underline text-gray-600"
            >
              support@secureplace.com
            </a>
          </div>
        </div>
      </footer>
      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}
