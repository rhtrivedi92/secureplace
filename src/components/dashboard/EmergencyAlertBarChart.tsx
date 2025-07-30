"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { databases, account } from "@/lib/appwrite";
import { Query } from "appwrite";
import type { Models } from "appwrite";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Lucide Icons
import {
  Loader2,
  AlertCircle,
  BellRing,
  CheckCircle, // Used for the checkmark icon in the image
} from "lucide-react";

// Interfaces (re-use from other components)
interface AppwriteProfile extends Models.Document {
  userId: string;
  fullName: string | null;
  officialEmail: string;
  role: string;
  firmId: string | null;
}

interface AppwriteIncident extends Models.Document {
  firmId: string;
  incidentType: string;
  status: string;
  // Appwrite automatically provides $createdAt for document creation timestamp
  $createdAt: string;
}

interface UserData {
  id: string;
  email?: string;
  role: string;
  firmId: string | null;
}

interface EmergencyAlertBarChartProps {
  // No props from Astro page
}

export default function EmergencyAlertBarChart({}: EmergencyAlertBarChartProps) {
  const [monthlyIncidentCounts, setMonthlyIncidentCounts] = useState<number[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);

  const DATABASE_ID = import.meta.env.PUBLIC_APPWRITE_DATABASE_ID;
  const USER_PROFILES_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID;
  const INCIDENTS_COLLECTION_ID = "incidents"; // Your incidents collection ID

  // Fetches incident data and processes it for the bar chart
  const fetchIncidentData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (
        !currentUser ||
        currentUser.role !== "firm_admin" ||
        !currentUser.firmId
      ) {
        console.warn(
          "BarChart: Unauthorized access or missing firmId. Aborting data fetch."
        );
        setMonthlyIncidentCounts(Array(12).fill(0)); // Set to empty data
        return;
      }

      // Fetch all incidents for the current firm (for the current year, or past 12 months)
      // For simplicity, fetching all and filtering client-side. For large datasets, use Appwrite Functions.
      const today = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1); // Or calculate for a specific year's data

      const { documents: incidentsData } =
        await databases.listDocuments<AppwriteIncident>(
          DATABASE_ID,
          INCIDENTS_COLLECTION_ID,
          [
            Query.equal("firmId", currentUser.firmId), // Filter by current Firm Admin's firm
            // Query.greaterThanEqual('$createdAt', oneYearAgo.toISOString()), // Filter by date if needed
            Query.orderAsc("$createdAt"), // Order for consistent processing
            Query.limit(5000), // Max limit for performance, adjust based on expected incidents
          ]
        );

      // Process data: Aggregate incidents by month
      const counts = Array(12).fill(0); // Jan (0) to Dec (11)
      incidentsData.forEach((incident) => {
        const incidentDate = new Date(incident.$createdAt);
        const month = incidentDate.getMonth(); // 0 for January, 11 for December
        counts[month]++;
      });

      setMonthlyIncidentCounts(counts);
      console.log("BarChart: Monthly Incident Counts:", counts);
    } catch (err: any) {
      console.error("BarChart: Error fetching incident data:", err.message);
      setError("Failed to load incident data: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser, DATABASE_ID, INCIDENTS_COLLECTION_ID]);

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
          setError("Access Denied: Only Firm Admins can view this chart.");
          setLoading(false);
          return;
        }
        if (!fetchedUser.firmId) {
          setError(
            "Firm Admin not assigned to a firm. Cannot display chart data."
          );
          setLoading(false);
          return;
        }
        console.log(
          "BarChart: Firm Admin access granted. Proceeding to fetch incident data."
        );
      } catch (err: any) {
        console.error("BarChart: Initial auth/role check failed:", err.message);
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
      fetchIncidentData();
    }
  }, [currentUser, fetchIncidentData]);

  // Chart.js Data and Options
  const chartData = useMemo(() => {
    const labels = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const currentMonthIndex = new Date().getMonth(); // 0-11

    const barColors = labels.map((_, index) => {
      if (index === currentMonthIndex) {
        return "rgb(255, 95, 21)"; // Orange for current month
      }
      // Assuming your standard bar color from style.css (e.g., #b2d8ff or similar light blue)
      // You might need to add this as a CSS variable or direct color if not found
      return "rgb(178, 216, 255)"; // Light blue for other months
    });

    const borderColors = labels.map((_, index) => {
      if (index === currentMonthIndex) {
        return "rgb(255, 95, 21)"; // Orange border for current month
      }
      return "rgb(10, 130, 253)"; // Darker blue border
    });

    // Determine the highest month count to highlight
    let highestMonthIndex: number | null = null;
    if (monthlyIncidentCounts.length > 0) {
      let maxCount = -1;
      monthlyIncidentCounts.forEach((count, index) => {
        if (count > maxCount) {
          maxCount = count;
          highestMonthIndex = index;
        }
      });
    }

    // Apply red to the highest month, if applicable and different from current month
    if (highestMonthIndex !== null && highestMonthIndex !== currentMonthIndex) {
      barColors[highestMonthIndex] = "rgb(229, 62, 62)"; // Red for highest month
      borderColors[highestMonthIndex] = "rgb(229, 62, 62)"; // Red border
    }

    return {
      labels,
      datasets: [
        {
          label: "Emergencies",
          data: monthlyIncidentCounts,
          backgroundColor: barColors,
          borderColor: borderColors,
          borderWidth: 1, // Only bottom border
          borderRadius: 8, // Rounded top corners for bars
          borderSkipped: false, // Ensure top border is visible
        },
      ],
    };
  }, [monthlyIncidentCounts]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false, // Allows chart to fill container size
      plugins: {
        legend: {
          display: false, // Hide default legend
        },
        title: {
          display: false, // Title will be in HTML
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0, 29, 73, 0.9)", // Match brand dark blue
          titleFont: { size: 14, weight: "bold" },
          bodyFont: { size: 12 },
          padding: 10,
          caretSize: 8,
          cornerRadius: 6,
          displayColors: false, // Hide color box in tooltip
          callbacks: {
            label: function (context: any) {
              let label = context.dataset.label || "";
              if (label) {
                label += ": ";
              }
              if (context.parsed.y !== null) {
                label += context.parsed.y;
              }
              return label;
            },
            title: function (context: any) {
              // Check if context has data and index
              if (context[0] && context[0].dataIndex !== undefined) {
                const monthName = chartData.labels[context[0].dataIndex];
                const count = chartData.datasets[0].data[context[0].dataIndex];
                if (count > 0) {
                  return `${count} Emergency in ${monthName}`; // Example "25 Emergency in Jun"
                }
              }
              return ""; // Return empty string if no data or not needed
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false, // Hide vertical grid lines
          },
          ticks: {
            color: "var(--text-medium)", // Month labels color
          },
          barPercentage: 0.6, // Width of bars
          categoryPercentage: 0.7, // Space between categories
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "#e8edff", // Light horizontal grid lines
          },
          ticks: {
            color: "var(--text-medium)",
            precision: 0, // Ensure integer ticks
          },
        },
      },
    }),
    [chartData]
  ); // Depend on chartData to update tooltip titles correctly

  // --- Conditional Rendering for Loading/Error States ---
  if (loading || !currentUser) {
    return (
      <div className="charts-main dashboard-chart-loading">
        <Loader2 className="loading-spinner" />
        <p className="loading-text">Loading alert data...</p>
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
    return null;
  }

  return (
    <div className="charts-main charts-home-one mg-top-30 dashboard-bar-chart-card">
      {" "}
      {/* Added dashboard-bar-chart-card */}
      <div className="charts-main__heading mg-btm-20">
        <h4 className="charts-main__title">Emergency Alert</h4>
        {/* Checkmark icon on the right as per image */}
        <div className="dashboard-chart-icon-wrapper dashboard-chart-icon-wrapper--green">
          <CheckCircle className="icon dashboard-icon" />
        </div>
      </div>
      <div className="charts-main__one dashboard-chart-canvas-wrapper">
        {" "}
        {/* Wrapper for responsive chart */}
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
