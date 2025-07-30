"use client";

import React, { useState, useCallback, useEffect } from "react";
import { account, databases } from "@/lib/appwrite"; // Import Appwrite services
import { Query } from "appwrite"; // For Appwrite database queries
import type { Models } from "appwrite"; // Import Models to access Document type
import { AppwriteException } from "appwrite"; // Import AppwriteException

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Eye, EyeOff, Mail, Loader2 } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./loginpage.css";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
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

  // Check for active session on component mount
  const checkActiveSession = useCallback(async () => {
    setIsLoading(true); // Ensure loading state is active during check
    setErrorMessage(null); // Clear any previous errors
    try {
      // Attempt to get the current authenticated user session from Appwrite
      const currentAppwriteUser = await account.get(); // Throws if no session or insufficient permissions
      console.log(
        "LoginPage: Existing session found for Appwrite User ID:",
        currentAppwriteUser.$id
      );

      // If a session is active, fetch the corresponding user profile from your database
      const userProfileResponse =
        await databases.listDocuments<AppwriteProfile>(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID,
          [
            Query.equal("userId", currentAppwriteUser.$id), // Appwrite User ID is currentSession.$id
            Query.limit(1), // Expect only one profile
          ]
        );

      if (userProfileResponse.documents.length === 0) {
        console.error(
          "LoginPage: User profile document not found for active session ID:",
          currentAppwriteUser.$id
        );
        await account.deleteSession("current"); // Log out from Appwrite if profile is missing
        setErrorMessage(
          "Your user profile is missing or inaccessible. Please contact support."
        );
        setIsLoading(false);
        return;
      }

      const profileData = userProfileResponse.documents[0]; // Get the found profile document
      const userRole = profileData.role;
      const firmId = profileData.firmId; // Get firmId from the profile

      console.log(
        "LoginPage: Session active, fetched profile role:",
        userRole,
        "Firm ID:",
        firmId
      );

      // Determine redirection path based on role
      let redirectPath = "/dashboard"; // Default generic dashboard
      switch (userRole) {
        case "super_admin":
          redirectPath = "/dashboard/super-admin";
          break;
        case "firm_admin":
          redirectPath = "/dashboard/firm-admin"; // Location management for firm admins
          break;
        default:
          redirectPath = "/dashboard"; // For other roles like 'employee'
          break;
      }

      console.log("LoginPage: Redirecting to:", redirectPath);
      window.location.href = redirectPath; // Redirect to appropriate dashboard
      return; // Stop further execution
    } catch (err: any) {
      if (
        err instanceof AppwriteException &&
        err.code === 401 &&
        err.message.includes("missing scope (account)")
      ) {
        console.log(
          "LoginPage: No active session (expected for guests). Displaying login form."
        );
      } else {
        console.error(
          "LoginPage: Unexpected error during initial session check:",
          err
        );
        setErrorMessage(
          "An error occurred during session check. Please try again."
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [databases, onRedirect]);

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

      const userProfileResponse =
        await databases.listDocuments<AppwriteProfile>(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID,
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
          redirectPath = "dashboard/super-admin";
          break;
        case "firm_admin":
          redirectPath = "dashboard/firm-admin";
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
      if (err instanceof AppwriteException) {
        // Check if it's an AppwriteException
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
          checkActiveSession();
        } else if (err.code === 401) {
          userFacingError = "Invalid email or password.";
        } else if (err.code === 429) {
          userFacingError = "Too many login attempts. Please try again later.";
        } else {
          userFacingError = err.message; // Use Appwrite's specific message
        }
      } else if (err.message.includes("Network request failed")) {
        userFacingError =
          "Network error. Please check your internet connection.";
      } else {
        userFacingError = "An unexpected error occurred."; // Generic fallback
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
    <div className="login-container">
      <div className="login-content-area">
        {" "}
        {/* Central container for logo & form */}
        {/* Left Section: Big Logo Only */}
        <div className="login-branding-area">
          <img
            src="/images/secure-place-logo.png"
            alt="Secure Place Logo"
            className="login-large-logo"
          />
        </div>
        {/* Right Section: Sign In Form */}
        <div className="login-form-area">
          <Card className="login-card">
            <CardHeader className="login-card-header">
              <CardTitle className="login-card-title">Sign In</CardTitle>
              <CardDescription className="login-card-description">
                Welcome back! Please enter your credentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="login-card-content">
              <form onSubmit={handleLogin} className="login-form">
                {/* Email Input */}
                <div className="form-group">
                  <Label htmlFor="email" className="form-label">
                    Email address*
                  </Label>
                  <div className="input-with-icon">
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="form-input"
                      placeholder="your.email@company.com"
                      required
                      aria-label="Email address"
                      autoComplete="email"
                    />
                    <Mail className="input-icon" />
                  </div>
                </div>

                {/* Password Input */}
                <div className="form-group">
                  <Label htmlFor="password" className="form-label">
                    Password*
                  </Label>
                  <div className="input-with-icon">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="form-input password-input"
                      placeholder="••••••••"
                      required
                      aria-label="Password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-button"
                      onClick={togglePasswordVisibility}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="icon" />
                      ) : (
                        <Eye className="icon" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error Message Display */}
                {errorMessage && (
                  <div className="error-message-inline">{errorMessage}</div>
                )}

                {/* Forgot Password Link */}
                <div className="form-link-right">
                  <button
                    type="button"
                    className="forgot-password-link"
                    onClick={() =>
                      alert(
                        "Forgot password functionality will be implemented."
                      )
                    }
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Sign In Button */}
                <Button
                  type="submit"
                  className="login-submit-button"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="icon-spin icon--small" /> Signing
                      In...
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

      {/* Footer */}
      <footer className="login-footer">
        <div className="login-footer-content">
          <div className="login-footer-copyright">
            &copy; 2025 Secure Place. All rights reserved.
          </div>
          <div className="login-footer-contact">
            <Mail className="login-footer-icon" />
            <a
              href="mailto:support@secureplace.com"
              className="login-footer-email-link"
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
