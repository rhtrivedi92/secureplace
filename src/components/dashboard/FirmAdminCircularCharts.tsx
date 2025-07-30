"use client";

import React, { useState, useEffect, useCallback } from "react";
import { account, databases } from "@/lib/appwrite";
import { Query } from "appwrite";
import type { Models } from "appwrite";

import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import "../management/firm-management.css";

import {
  Loader2,
  AlertCircle,
  BellRing,
  BookOpen,
  CheckCircle,
} from "lucide-react";
import { toast } from "react-toastify";

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

interface FirmAdminCircularChartsProps {
  // No props from Astro page
}

export default function FirmAdminCircularCharts({}: FirmAdminCircularChartsProps) {
  const [drillCount, setDrillCount] = useState<number | null>(null);
  const [workshopCount, setWorkshopCount] = useState<number | null>(null);
  const [compliancePercentage, setCompliancePercentage] = useState<
    number | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);

  const DATABASE_ID = import.meta.env.PUBLIC_APPWRITE_DATABASE_ID;
  const USER_PROFILES_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID;
  const DRILLS_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_DRILLS_COLLECTION_ID;
  const SAFETY_TRAININGS_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_SAFETY_TRAININGS_COLLECTION_ID;
  // const SAFETY_SURVEYS_COLLECTION_ID = import.meta.env.PUBLIC_APPWRITE_SAFETY_SURVEYS_COLLECTION_ID; // Not used directly in calculation for simplicity

  // Fetches data for the circular charts
  const fetchChartData = useCallback(async () => {
    setLoading(true); // Keep loading true during data fetch
    setError(null);
    try {
      if (
        !currentUser ||
        currentUser.role !== "firm_admin" ||
        !currentUser.firmId
      ) {
        console.warn(
          "CircularCharts: Unauthorized access or missing firmId. Aborting data fetch."
        );
        setDrillCount(null);
        setWorkshopCount(null);
        setCompliancePercentage(null);
        return;
      }

      // 1. Fetch Drill Count
      const { total: drillTotal } = await databases.listDocuments(
        DATABASE_ID,
        DRILLS_COLLECTION_ID,
        [Query.equal("firmId", currentUser.firmId)]
      );
      setDrillCount(drillTotal);

      // 2. Fetch Workshop/Training Count
      const { total: workshopTotal } = await databases.listDocuments(
        DATABASE_ID,
        SAFETY_TRAININGS_COLLECTION_ID,
        [Query.equal("firmId", currentUser.firmId)]
      );
      setWorkshopCount(workshopTotal);

      // 3. Calculate Compliance Percentage (Drill Alert vs Workshop Ratio)
      let calculatedCompliance = 0;
      if (drillTotal !== null && workshopTotal !== null && workshopTotal > 0) {
        calculatedCompliance = (drillTotal / workshopTotal) * 100;
        calculatedCompliance = Math.min(calculatedCompliance, 100); // Cap at 100%
      } else if (drillTotal !== null && workshopTotal === 0 && drillTotal > 0) {
        calculatedCompliance = 100; // If drills but no workshops, assume 100% compliance if drills exist
      } else if (drillTotal === 0 && workshopTotal === 0) {
        calculatedCompliance = 0; // No drills, no workshops
      }
      setCompliancePercentage(calculatedCompliance);
    } catch (err: any) {
      console.error("CircularCharts: Error fetching chart data:", err.message);
      setError("Failed to load chart data: " + err.message);
      toast.error("Failed to load dashboard data: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [
    currentUser,
    DATABASE_ID,
    DRILLS_COLLECTION_ID,
    SAFETY_TRAININGS_COLLECTION_ID,
  ]);

  // Effect to perform initial authentication check and load data (similar to management components)
  useEffect(() => {
    const checkAuthAndRole = async () => {
      setLoading(true);
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
      fetchChartData();
    }
  }, [currentUser, fetchChartData]);

  // --- Conditional Rendering for Loading/Error States ---
  if (loading || !currentUser) {
    return (
      <div className="charts-main dashboard-chart-loading">
        <Loader2 className="loading-spinner" />
        <p className="loading-text">Loading dashboard charts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="charts-main dashboard-chart-error">
        <AlertCircle className="error-icon" />
        <p className="error-message">{error}</p>
      </div>
    );
  }

  if (currentUser.role !== "firm_admin" || !currentUser.firmId) {
    return null; // Don't render content if not authorized; error state above covers the display
  }

  return (
    <div className="row crancy-gap-30">
      {/* Drill Alert Chart */}
      <div className="col-lg-4 col-12 mg-top-30">
        <div className="charts-main crancy-ecom-card crancy-ecom-card__v2 dashboard-chart-card">
          <div className="charts-main__heading mg-btm-20">
            <h4 className="charts-main__title">Drill Alert</h4>
            <div className="dashboard-chart-icon-wrapper dashboard-chart-icon-wrapper--orange">
              <BellRing className="icon dashboard-icon" />
            </div>
          </div>
          <div className="charts-main__one dashboard-chart-circle">
            <CircularProgressbar
              value={drillCount !== null ? Math.min(drillCount * 10, 100) : 0} // Example scale: 10 drills = 100%
              text={`${drillCount !== null ? drillCount : "..."}`}
              circleRatio={0.75}
              styles={buildStyles({
                rotation: 1 / 2 + 1 / 8,
                trailColor: "#f3f3f3",
                pathColor: "var(--brand-orange)", // Accent Orange
                textColor: "var(--text-dark)",
                textSize: "24px",
              })}
            />
            <div className="dashboard-chart-labels">
              <span className="dashboard-chart-label dashboard-chart-label--path">
                Total: {drillCount !== null ? drillCount : "..."}
              </span>{" "}
              {/* Updated label */}
            </div>
          </div>
        </div>
      </div>

      {/* Workshop Chart */}
      <div className="col-lg-4 col-12 mg-top-30">
        <div className="charts-main crancy-ecom-card crancy-ecom-card__v2 dashboard-chart-card">
          <div className="charts-main__heading mg-btm-20">
            <h4 className="charts-main__title">Workshop</h4>
            <div className="dashboard-chart-icon-wrapper dashboard-chart-icon-wrapper--orange">
              <BookOpen className="icon dashboard-icon" />
            </div>
          </div>
          <div className="charts-main__one dashboard-chart-circle">
            <CircularProgressbar
              value={
                workshopCount !== null ? Math.min(workshopCount * 25, 100) : 0
              } // Example scale: 4 workshops = 100%
              text={`${workshopCount !== null ? workshopCount : "..."}`}
              circleRatio={0.75}
              styles={buildStyles({
                rotation: 1 / 2 + 1 / 8,
                trailColor: "#f3f3f3",
                pathColor: "var(--brand-orange)", // Primary Dark Blue
                textColor: "var(--text-dark)",
                textSize: "24px",
              })}
            />
            <div className="dashboard-chart-labels">
              <span className="dashboard-chart-label dashboard-chart-label--path">
                Total: {workshopCount !== null ? workshopCount : "..."}
              </span>{" "}
              {/* Updated label */}
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Chart (Donut-like) */}
      <div className="col-lg-4 col-12 mg-top-30">
        <div className="charts-main crancy-ecom-card crancy-ecom-card__v2 dashboard-chart-card">
          <div className="charts-main__heading mg-btm-20">
            <h4 className="charts-main__title">Compliance</h4>
            <div className="dashboard-chart-icon-wrapper dashboard-chart-icon-wrapper--orange">
              <CheckCircle className="icon dashboard-icon" />
            </div>
          </div>
          <div className="charts-main__one dashboard-chart-donut">
            <CircularProgressbar
              value={compliancePercentage !== null ? compliancePercentage : 0}
              text={`${
                compliancePercentage !== null
                  ? Math.round(compliancePercentage)
                  : "..."
              }%`}
              styles={buildStyles({
                rotation: 0,
                trailColor: "#f3f3f3",
                pathColor: "var(--brand-orange)", // Accent Orange
                textColor: "var(--text-dark)",
                textSize: "24px",
              })}
            />
            <div className="dashboard-chart-labels dashboard-chart-labels--bottom">
              <span className="dashboard-chart-label dashboard-chart-label--dot dashboard-chart-label--orange">
                Workshops: {workshopCount !== null ? workshopCount : "..."}
              </span>{" "}
              {/* Updated label */}
              <span className="dashboard-chart-label dashboard-chart-label--dot dashboard-chart-label--blue">
                Drills: {drillCount !== null ? drillCount : "..."}
              </span>{" "}
              {/* Updated label */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
