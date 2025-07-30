"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { databases, account } from "@/lib/appwrite";
import { Query } from "appwrite";
import type { Models } from "appwrite";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, AlertCircle, CheckCircle, Clock } from "lucide-react"; // Icons for status and loading
import { toast, ToastContainer } from "react-toastify"; // Ensure ToastContainer is included for its CSS

// Interfaces (re-use from other components)
interface AppwriteProfile extends Models.Document {
  userId: string;
  fullName: string | null;
  officialEmail: string;
  role: string;
  firmId: string | null;
  isVolunteer?: boolean;
  locationId?: string | null;
}

interface UserData {
  id: string;
  email?: string;
  role: string;
  firmId: string | null;
}

// Interface for Safety Training documents
interface SafetyTraining extends Models.Document {
  firmId: string;
  title: string;
  type: string; // e.g., 'in-person', 'remote'
  duration: string | null; // e.g., "15 Min", "50 Min"
  status: string | null; // CRITICAL FIX: Make status nullable in interface
  startTime: string; // ISO 8601 string for Datetime
  endTime: string; // ISO 8601 string for Datetime
}

interface SafetyClassesTableProps {
  // No props from Astro page
}

export default function SafetyClassesTable({}: SafetyClassesTableProps) {
  const [activeTab, setActiveTab] = useState<"completed" | "upcoming">(
    "completed"
  );
  const [allTrainings, setAllTrainings] = useState<SafetyTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);

  // Appwrite Collection IDs
  const DATABASE_ID = import.meta.env.PUBLIC_APPWRITE_DATABASE_ID;
  const USER_PROFILES_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID;
  const SAFETY_TRAININGS_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_SAFETY_TRAININGS_COLLECTION_ID;

  // Fetch all trainings for the current Firm Admin's firm
  const fetchTrainings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (
        !currentUser ||
        currentUser.role !== "firm_admin" ||
        !currentUser.firmId
      ) {
        console.warn(
          "SafetyClassesTable: Unauthorized access or missing firmId. Aborting fetch."
        );
        setAllTrainings([]);
        return;
      }

      const { documents: trainingsData } =
        await databases.listDocuments<SafetyTraining>(
          DATABASE_ID,
          SAFETY_TRAININGS_COLLECTION_ID,
          [
            Query.equal("firmId", currentUser.firmId), // Filter by firm
            Query.orderDesc("startTime"), // Order by start time
            Query.limit(100), // Max limit for now, consider pagination for many trainings
          ]
        );
      setAllTrainings(trainingsData || []);
      console.log("SafetyClassesTable: Fetched Trainings:", trainingsData);
    } catch (err: any) {
      console.error(
        "SafetyClassesTable: Error fetching trainings:",
        err.message
      );
      setError("Failed to load safety classes: " + err.message);
      toast.error("Failed to load safety classes: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser, DATABASE_ID, SAFETY_TRAININGS_COLLECTION_ID]);

  // Filter trainings based on active tab and dates
  const filteredTrainings = useMemo(() => {
    const now = new Date();
    if (!allTrainings) return [];

    return allTrainings.filter((training) => {
      // Ensure startTime and endTime are valid strings before creating Date objects
      const endTime = training.endTime ? new Date(training.endTime) : null;
      const startTime = training.startTime
        ? new Date(training.startTime)
        : null;

      if (
        !startTime ||
        !endTime ||
        isNaN(startTime.getTime()) ||
        isNaN(endTime.getTime())
      ) {
        console.warn(
          `SafetyClassesTable: Skipping training '${training.title}' due to invalid dates.`
        );
        return false; // Skip training if dates are invalid
      }

      if (activeTab === "completed") {
        // A class is 'completed' if its end time is in the past
        return endTime < now;
      } else {
        // 'upcoming' tab
        // A class is 'upcoming' if its start time is in the future
        return startTime >= now;
      }
    });
  }, [allTrainings, activeTab]);

  // Initial auth check (similar to other management components)
  useEffect(() => {
    const checkAuthAndRole = async () => {
      setLoading(true);
      setError(null);
      try {
        const currentAppwriteUser = await account.get();
        const userProfileResponse =
          await databases.listDocuments<AppwriteProfile>(
            DATABASE_ID,
            USER_PROFILES_COLLECTION_ID,
            [Query.equal("userId", currentAppwriteUser.$id), Query.limit(1)]
          );

        if (userProfileResponse.documents.length === 0) {
          console.error(
            "SafetyClassesTable: User profile document not found. Signing out."
          );
          await account.deleteSession("current");
          window.location.href = "/";
          return;
        }
        const profileData = userProfileResponse.documents[0];
        const fetchedUser: UserData = {
          id: profileData.userId,
          email: profileData.officialEmail,
          role: profileData.role,
          firmId: profileData.firmId,
        };
        setCurrentUser(fetchedUser);

        if (fetchedUser.role !== "firm_admin") {
          // This dashboard is for Firm Admins
          setError("Access Denied: Only Firm Admins can view safety classes.");
          setLoading(false);
          return;
        }
        if (!fetchedUser.firmId) {
          // Firm Admin must be assigned to a firm
          setError(
            "Firm Admin not assigned to a firm. Cannot display safety classes."
          );
          setLoading(false);
          return;
        }
        console.log(
          "SafetyClassesTable: Firm Admin access granted. Proceeding to fetch trainings."
        );
      } catch (err: any) {
        console.error("SafetyClassesTable: Auth check failed:", err.message);
        setError("Authentication check failed. Please try logging in again.");
        setLoading(false);
      }
    };
    checkAuthAndRole();
  }, [DATABASE_ID, USER_PROFILES_COLLECTION_ID]);

  // Trigger data fetch when currentUser is set and authorized
  useEffect(() => {
    if (
      currentUser &&
      currentUser.role === "firm_admin" &&
      currentUser.firmId
    ) {
      fetchTrainings();
    }
  }, [currentUser, fetchTrainings]);

  // Helper to format date
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        // Check for invalid date
        return "Invalid Date";
      }
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      console.error("Error formatting date:", e);
      return "Invalid Date";
    }
  };

  // --- Conditional Rendering for Loading/Error States ---
  if (loading || !currentUser) {
    return (
      <div className="charts-main dashboard-card-loading">
        <Loader2 className="loading-spinner" />
        <p className="loading-text">Loading safety classes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="charts-main dashboard-card-error">
        <AlertCircle className="error-icon" />
        <p className="error-message">{error}</p>
      </div>
    );
  }

  if (currentUser.role !== "firm_admin" || !currentUser.firmId) {
    return null; // Don't render content if not authorized; error state above covers the display
  }

  return (
    <div className="crancy-sidebar__single crancy-table-card">
      <div className="crancy-spending-overview">
        <div className="crancy-spending-overview__tabs">
          <div
            className="list-group list-group crancy-new-list__tabs"
            id="list-tab"
            role="tablist"
          >
            <a
              className={`list-group-item ${
                activeTab === "completed" ? "active" : ""
              }`}
              onClick={() => setActiveTab("completed")}
              role="tab"
            >
              <span className="crancy-tsidebar__icon"></span>Completed
            </a>
            <a
              className={`list-group-item ${
                activeTab === "upcoming" ? "active" : ""
              }`}
              onClick={() => setActiveTab("upcoming")}
              role="tab"
            >
              <span className="crancy-tsidebar__icon"></span>Upcoming
            </a>
          </div>
        </div>

        <div className="tab-content" id="nav-tabContent">
          <div className="tab-pane fade show active" role="tabpanel">
            <div className="crancy-spending-card mg-top-20">
              <h4 className="crancy-spending-card__title">Safety Classes</h4>
              <div className="table-responsive">
                <Table className="crancy-table safety-classes-table">
                  <TableHeader className="crancy-table-header">
                    <TableRow>
                      <TableHead className="crancy-table-head-cell">
                        Course Name
                      </TableHead>
                      <TableHead className="crancy-table-head-cell">
                        Type
                      </TableHead>
                      <TableHead className="crancy-table-head-cell">
                        Duration
                      </TableHead>
                      <TableHead className="crancy-table-head-cell">
                        Status
                      </TableHead>
                      <TableHead className="crancy-table-head-cell">
                        Date
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="crancy-table-body">
                    {filteredTrainings.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="empty-results-message"
                        >
                          No {activeTab} classes found for your firm.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTrainings.map((training) => (
                        <TableRow key={training.$id} className="firm-table-row">
                          <TableCell className="crancy-table-cell table-cell table-cell--name">
                            {training.title}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {training.type}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {training.duration || "N/A"}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {/* Status Badge */}
                            <span
                              className={`crancy-table__status status--${
                                training.status
                                  ? training.status.toLowerCase()
                                  : "unknown"
                              }`}
                            >
                              {" "}
                              {/* CRITICAL FIX: Add null check for training.status */}
                              {training.status?.toLowerCase() ===
                                "approved" && (
                                <CheckCircle className="icon icon--status" />
                              )}
                              {training.status?.toLowerCase() === "pending" && (
                                <Clock className="icon icon--status" />
                              )}
                              {training.status?.toLowerCase() ===
                                "completed" && (
                                <CheckCircle className="icon icon--status" />
                              )}
                              {training.status
                                ? training.status.charAt(0).toUpperCase() +
                                  training.status.slice(1)
                                : "Unknown"}{" "}
                              {/* CRITICAL FIX: Add null check for training.status */}
                            </span>
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {formatDate(training.startTime)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
