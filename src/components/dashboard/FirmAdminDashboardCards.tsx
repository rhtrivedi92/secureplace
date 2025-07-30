"use client";

import React, { useState, useEffect, useCallback } from "react";
import { account, databases } from "@/lib/appwrite"; // Appwrite services
import { Query } from "appwrite"; // Appwrite Query
import type { Models } from "appwrite"; // Appwrite Models

// Lucide Icons
import {
  MapPin, // For Locations
  Users, // For Employees
  HandHelping, // For Volunteers
  Loader2, // For loading state
  AlertCircle, // For error state
} from "lucide-react";
import { toast } from "react-toastify";

// Interfaces (re-use from other components)
interface AppwriteProfile extends Models.Document {
  userId: string;
  fullName: string | null;
  officialEmail: string;
  role: string;
  firmId: string | null;
  isVolunteer?: boolean; // Ensure this attribute exists in Appwrite
}

interface UserData {
  id: string;
  email?: string;
  role: string;
  firmId: string | null; // This is the Firm Admin's firmId
}

interface FirmAdminDashboardCardsProps {
  // This component will fetch current user data internally, similar to management tables
}

export default function FirmAdminDashboardCards({}: FirmAdminDashboardCardsProps) {
  const [locationsCount, setLocationsCount] = useState<number | null>(null);
  const [employeesCount, setEmployeesCount] = useState<number | null>(null);
  const [volunteersCount, setVolunteersCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null); // State for current Firm Admin

  // Appwrite Collection IDs
  const DATABASE_ID = import.meta.env.PUBLIC_APPWRITE_DATABASE_ID;
  const USER_PROFILES_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID;
  const LOCATIONS_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_LOCATIONS_COLLECTION_ID;

  // Fetches counts for Firm Admin's dashboard cards
  const fetchDashboardCounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (
        !currentUser ||
        currentUser.role !== "firm_admin" ||
        !currentUser.firmId
      ) {
        console.warn(
          "DashboardCards: Unauthorized access or missing firmId. Aborting count fetch."
        );
        // We set counts to null to indicate no data or error
        setLocationsCount(null);
        setEmployeesCount(null);
        setVolunteersCount(null);
        return;
      }

      const { total: locTotal } = await databases.listDocuments(
        DATABASE_ID,
        LOCATIONS_COLLECTION_ID,
        [Query.equal("firmId", currentUser.firmId)]
      );
      setLocationsCount(locTotal);

      const { total: empTotal } = await databases.listDocuments(
        DATABASE_ID,
        USER_PROFILES_COLLECTION_ID,
        [
          Query.equal("firmId", currentUser.firmId),
          Query.or([
            Query.equal("role", "employee"),
            Query.equal("role", "security"),
            Query.equal("role", "volunteer"),
          ]),
        ]
      );
      setEmployeesCount(empTotal);

      const { total: volTotal } = await databases.listDocuments(
        DATABASE_ID,
        USER_PROFILES_COLLECTION_ID,
        [
          Query.equal("firmId", currentUser.firmId),
          Query.equal("isVolunteer", true),
        ]
      );
      setVolunteersCount(volTotal);
    } catch (err: any) {
      console.error(
        "DashboardCards: Error fetching dashboard counts:",
        err.message
      );
      setError("Failed to load dashboard data: " + err.message);
      toast.error("Failed to load dashboard data: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [
    currentUser,
    DATABASE_ID,
    LOCATIONS_COLLECTION_ID,
    USER_PROFILES_COLLECTION_ID,
  ]);

  // Effect to perform initial authentication check and load data
  useEffect(() => {
    const checkAuthAndRole = async () => {
      setLoading(true); // Start loading for auth check
      setError(null);
      try {
        const currentAppwriteUser = await account.get();
        console.log(
          "DashboardCards: Appwrite User found:",
          currentAppwriteUser.$id
        );

        const userProfileResponse =
          await databases.listDocuments<AppwriteProfile>(
            DATABASE_ID,
            USER_PROFILES_COLLECTION_ID,
            [Query.equal("userId", currentAppwriteUser.$id), Query.limit(1)]
          );

        if (userProfileResponse.documents.length === 0) {
          console.error(
            "DashboardCards: User profile document not found. Signing out."
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
          console.warn("DashboardCards: Access Denied. Not a Firm Admin.");
          setError("Access Denied: Only Firm Admins can view this dashboard.");
          setLoading(false);
          return;
        }
        if (!fetchedUser.firmId) {
          // Firm Admin must be assigned to a firm
          setError(
            "Firm Admin not assigned to a firm. Please contact your Super Admin."
          );
          setLoading(false);
          return;
        }

        console.log(
          "DashboardCards: User is Firm Admin. Access granted. Proceeding to fetch counts."
        );
      } catch (err: any) {
        console.error(
          "DashboardCards: Initial auth/role check failed:",
          err.message
        );
        setError("Authentication check failed. Please try logging in again.");
        setLoading(false);
      }
    };
    checkAuthAndRole();
  }, [DATABASE_ID, USER_PROFILES_COLLECTION_ID]);

  // Effect to trigger data fetching once currentUser is successfully set and authorized
  useEffect(() => {
    if (
      currentUser &&
      currentUser.role === "firm_admin" &&
      currentUser.firmId
    ) {
      fetchDashboardCounts();
    }
  }, [currentUser, fetchDashboardCounts]);

  // --- Conditional Rendering for Loading/Error States ---
  if (loading || !currentUser) {
    return (
      <div className="crancy-ecom-card crancy-ecom-card__v2 dashboard-card-loading">
        <Loader2 className="loading-spinner" />
        <p className="loading-text">Loading dashboard data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="crancy-ecom-card crancy-ecom-card__v2 dashboard-card-error">
        <AlertCircle className="error-icon" />
        <p className="error-message">{error}</p>
      </div>
    );
  }

  // Display access denied if the user is not a Firm Admin (after loading)
  if (currentUser.role !== "firm_admin") {
    return (
      <div className="crancy-ecom-card crancy-ecom-card__v2 dashboard-card-error">
        <AlertCircle className="error-icon" />
        <p className="error-message">
          Access Denied: You do not have permission to view this dashboard.
        </p>
      </div>
    );
  }
  if (!currentUser.firmId) {
    return (
      <div className="crancy-ecom-card crancy-ecom-card__v2 dashboard-card-error">
        <AlertCircle className="error-icon" />
        <p className="error-message">
          Firm Admin not assigned to a firm. Cannot display dashboard data.
        </p>
      </div>
    );
  }

  return (
    <div className="row">
      {/* Locations Card */}
      <div className="col-lg-4 col-12 mg-top-30">
        <div className="crancy-ecom-card crancy-ecom-card__v2 dashboard-card">
          <div className="crancy-ecom-card__heading">
            <div className="crancy-ecom-card__icon">
              <h4 className="crancy-ecom-card__title">Locations</h4>
            </div>
            {/* Icon on the right side */}
            <div className="dashboard-card-right-icon dashboard-card-right-icon--orange">
              <MapPin className="icon dashboard-icon" />
            </div>
          </div>
          <div className="crancy-ecom-card__content">
            <div className="crancy-ecom-card__camount">
              <div className="crancy-ecom-card__camount__inside">
                <h3 className="crancy-ecom-card__amount">
                  {locationsCount !== null ? locationsCount : "..."}
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Employees Card */}
      <div className="col-lg-4 col-12 mg-top-30">
        <div className="crancy-ecom-card crancy-ecom-card__v2 dashboard-card">
          <div className="crancy-ecom-card__heading">
            <div className="crancy-ecom-card__icon">
              <h4 className="crancy-ecom-card__title">Employees</h4>
            </div>
            {/* Icon on the right side */}
            <div className="dashboard-card-right-icon dashboard-card-right-icon--orange">
              <Users className="icon dashboard-icon" />
            </div>
          </div>
          <div className="crancy-ecom-card__content">
            <div className="crancy-ecom-card__camount">
              <div className="crancy-ecom-card__camount__inside">
                <h3 className="crancy-ecom-card__amount">
                  {employeesCount !== null ? employeesCount : "..."}
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Volunteers Card */}
      <div className="col-lg-4 col-12 mg-top-30">
        <div className="crancy-ecom-card crancy-ecom-card__v2 dashboard-card">
          <div className="crancy-ecom-card__heading">
            <div className="crancy-ecom-card__icon">
              <h4 className="crancy-ecom-card__title">Volunteers</h4>
            </div>
            {/* Icon on the right side */}
            <div className="dashboard-card-right-icon dashboard-card-right-icon--orange">
              <HandHelping className="icon dashboard-icon" />
            </div>
          </div>
          <div className="crancy-ecom-card__content">
            <div className="crancy-ecom-card__camount">
              <div className="crancy-ecom-card__camount__inside">
                <h3 className="crancy-ecom-card__amount">
                  {volunteersCount !== null ? volunteersCount : "..."}
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
