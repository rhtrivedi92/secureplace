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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertCircle,
  Eye,
  SlidersHorizontal,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Label } from "../ui/label";
import "../management/firm-management.css";

// Interfaces
interface AppwriteProfile extends Models.Document {
  userId: string;
  fullName: string | null;
  officialEmail: string;
  contactNumber?: string | null;
  employeeCode?: string | null;
  role: string;
  firmId: string | null;
}

interface AppwriteIncident extends Models.Document {
  firmId: string;
  incidentType: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  triggeredByUserId: string | null;
  $createdAt: string;
}

interface LogEntry extends AppwriteIncident {
  // Combine incident data with relevant employee details for display
  employeeName: string | null;
  employeeEmail: string | null;
  employeeNumber: string | null;
  employeeCode: string | null;
}

interface UserData {
  id: string;
  email?: string;
  role: string;
  firmId: string | null;
}

interface EmergencyAlertLogTableProps {
  // No props from Astro page
}

export default function EmergencyAlertLogTable({}: EmergencyAlertLogTableProps) {
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]); // State to hold final processed entries
  const [allIncidents, setAllIncidents] = useState<AppwriteIncident[]>([]); // All fetched incidents before client-side processing
  const [allProfiles, setAllProfiles] = useState<AppwriteProfile[]>([]); // All relevant profiles for lookup
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0); // From Appwrite total, used for pagination info
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterIncidentType, setFilterIncidentType] = useState<string>("");

  const DATABASE_ID = import.meta.env.PUBLIC_APPWRITE_DATABASE_ID;
  const USER_PROFILES_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID;
  const INCIDENTS_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_INCIDENTS_COLLECTION_ID;

  // Fetches incidents and related employee profiles
  const fetchAlertLogs = useCallback(async () => {
    setLoading(true); // Re-set loading true for each fetch operation
    setError(null);
    try {
      if (
        !currentUser ||
        currentUser.role !== "firm_admin" ||
        !currentUser.firmId
      ) {
        console.warn(
          "AlertLogTable: Unauthorized access or missing firmId. Aborting fetch."
        );
        setAllIncidents([]);
        setAllProfiles([]);
        setTotalRecords(0);
        return;
      }

      // Build queries for Appwrite (including pagination and filters)
      const incidentsQueries = [
        Query.equal("firmId", currentUser.firmId), // Filter by current Firm Admin's firm
        Query.orderDesc("$createdAt"), // Order by latest incidents
        // Server-side Pagination: limit and offset
        Query.limit(itemsPerPage),
        Query.offset((currentPage - 1) * itemsPerPage),
      ];

      // Add filters if active
      if (filterStatus) {
        incidentsQueries.push(Query.equal("status", filterStatus));
      }
      if (filterIncidentType) {
        incidentsQueries.push(Query.equal("incidentType", filterIncidentType));
      }

      // Add search if Appwrite supports it (Query.search on specific attributes, or more complex for multiple fields)
      if (searchTerm) {
        // Appwrite's search is limited to specific text attributes.
        // For general multi-field search like this, fetching all and filtering client-side might be needed
        // OR creating a specific search index in Appwrite.
        // For simplicity, for comprehensive multi-field search, fetching a larger dataset and client-side filtering is done in processedLogEntries.
        // If you had a specific 'searchIndex' attribute, you could use Query.search('searchIndex', searchTerm) here.
      }

      // Fetch incidents for the current page with filters
      const { documents: incidentsDocs, total: incidentsTotal } =
        await databases.listDocuments<AppwriteIncident>(
          DATABASE_ID,
          INCIDENTS_COLLECTION_ID,
          incidentsQueries // Pass the combined queries array
        );
      setAllIncidents(incidentsDocs || []); // Set all incidents (for client-side processing)
      setTotalRecords(incidentsTotal); // Set total count from Appwrite

      // Fetch all profiles for the current firm (for lookup)
      const { documents: profilesDocs } =
        await databases.listDocuments<AppwriteProfile>(
          DATABASE_ID,
          USER_PROFILES_COLLECTION_ID,
          [
            Query.equal("firmId", currentUser.firmId),
            Query.limit(5000), // Max limit to get all relevant profiles for client-side lookup
          ]
        );
      setAllProfiles(profilesDocs || []);

      // processedLogEntries will be computed via useMemo after allIncidents and allProfiles are set
    } catch (err: any) {
      console.error("AlertLogTable: Error fetching alert logs:", err.message);
      setError("Failed to load alert logs: " + err.message);
    } finally {
      setLoading(false); // Set loading to false after data fetch attempt
    }
  }, [
    currentUser,
    DATABASE_ID,
    INCIDENTS_COLLECTION_ID,
    USER_PROFILES_COLLECTION_ID,
    itemsPerPage,
    currentPage,
    filterStatus,
    filterIncidentType,
    searchTerm,
  ]); // Dependencies for refetch

  // Process and filter/paginate data client-side (now only for search, as pagination/filters are server-side)
  const processedLogEntries = useMemo(() => {
    // CRITICAL FIX: Ensure allIncidents is an array before processing
    if (!allIncidents || allIncidents.length === 0) return [];

    let combinedData: LogEntry[] = allIncidents.map((incident) => {
      const triggeredByProfile = (allProfiles || []).find(
        (profile) => profile.userId === incident.triggeredByUserId
      );
      return {
        ...incident,
        employeeName: triggeredByProfile?.fullName || "Unknown",
        employeeEmail: triggeredByProfile?.officialEmail || "N/A",
        employeeNumber: triggeredByProfile?.contactNumber || "N/A",
        employeeCode: triggeredByProfile?.employeeCode || "N/A",
      };
    });

    // Apply client-side search term if it's not handled fully by Appwrite query for complex searches
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      combinedData = combinedData.filter(
        (entry) =>
          entry.employeeCode?.toLowerCase().includes(lowerCaseSearchTerm) ||
          entry.employeeName?.toLowerCase().includes(lowerCaseSearchTerm) ||
          entry.employeeEmail?.toLowerCase().includes(lowerCaseSearchTerm) ||
          entry.employeeNumber?.includes(lowerCaseSearchTerm) ||
          entry.incidentType.toLowerCase().includes(lowerCaseSearchTerm) ||
          entry.status.toLowerCase().includes(lowerCaseSearchTerm)
      );
    }
    // No client-side slicing here, as pagination is now handled server-side in fetchAlertLogs
    return combinedData;
  }, [allIncidents, allProfiles, searchTerm]); // Dependencies for processing

  const totalPages = useMemo(() => {
    // CRITICAL FIX: Ensure totalRecords is treated as 0 if null/undefined
    return Math.ceil((totalRecords || 0) / itemsPerPage);
  }, [totalRecords, itemsPerPage]);

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
          console.warn("AlertLogTable: Access Denied. Not a Firm Admin.");
          setError("Access Denied: Only Firm Admins can view alert logs.");
          setLoading(false);
          return;
        }
        if (!fetchedUser.firmId) {
          setError(
            "AlertLogTable: Firm Admin not assigned to a firm. Cannot display alert logs."
          );
          setLoading(false);
          return;
        }
        console.log(
          "AlertLogTable: Firm Admin access granted. Proceeding to fetch logs."
        );
      } catch (err: any) {
        console.error("AlertLogTable: Auth check failed:", err.message);
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
      fetchAlertLogs();
    }
  }, [currentUser, fetchAlertLogs]);

  const handleItemsPerPageChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to first page
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterStatus("");
    setFilterIncidentType("");
    setCurrentPage(1);
    // fetchAlertLogs() will be triggered by filter state changes in useEffect
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  if (loading || !currentUser) {
    return (
      <div className="charts-main dashboard-card-loading">
        <Loader2 className="loading-spinner" />
        <p className="loading-text">Loading alert logs...</p>
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
    return null;
  }

  return (
    <div className="crancy-sidebar__single crancy-table-card alert-log-table-card">
      <div className="crancy-table__heading">
        <h4 className="charts-main__title">Emergency Alert Log</h4>
        <div className="crancy-customer-filter--inline">
          <select
            className="crancy-input form-input filter-select"
            value={filterIncidentType}
            onChange={(e) => setFilterIncidentType(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="medical">Medical</option>
            <option value="security">Security</option>
            <option value="fire">Fire</option>
            <option value="drill">Drill</option>
          </select>
          <select
            className="crancy-input form-input filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Button
            onClick={handleResetFilters}
            className="crancy-btn button--outline"
          >
            <RotateCcw className="icon" /> Reset Filters
          </Button>
        </div>
      </div>

      <div className="table-responsive">
        <Table className="crancy-table alert-log-table">
          <TableHeader className="crancy-table-header">
            <TableRow>
              <TableHead className="crancy-table-head-cell">Code</TableHead>
              <TableHead className="crancy-table-head-cell">
                Employee Name
              </TableHead>
              <TableHead className="crancy-table-head-cell">
                Employee Number
              </TableHead>
              <TableHead className="crancy-table-head-cell">Email Id</TableHead>
              <TableHead className="crancy-table-head-cell">
                Emergency Date
              </TableHead>
              <TableHead className="crancy-table-head-cell">
                Emergency Time
              </TableHead>
              <TableHead className="crancy-table-head-cell table-head-cell--actions"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="crancy-table-body">
            {processedLogEntries.length === 0 ? ( // CRITICAL FIX: Check processedLogEntries
              <TableRow>
                <TableCell colSpan={7} className="empty-results-message">
                  No alert logs found for your firm matching the current
                  filters.
                </TableCell>
              </TableRow>
            ) : (
              processedLogEntries.map(
                (
                  log // CRITICAL FIX: Map processedLogEntries
                ) => (
                  <TableRow key={log.$id} className="firm-table-row">
                    <TableCell className="crancy-table-cell table-cell">
                      {log.employeeCode}
                    </TableCell>
                    <TableCell className="crancy-table-cell table-cell table-cell--name">
                      {log.employeeName}
                    </TableCell>
                    <TableCell className="crancy-table-cell table-cell">
                      {log.employeeNumber}
                    </TableCell>
                    <TableCell className="crancy-table-cell table-cell">
                      {log.employeeEmail}
                    </TableCell>
                    <TableCell className="crancy-table-cell table-cell">
                      {new Date(log.$createdAt).toLocaleDateString("en-US")}
                    </TableCell>
                    <TableCell className="crancy-table-cell table-cell">
                      {new Date(log.$createdAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </TableCell>
                    <TableCell className="crancy-table-cell table-cell--actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="action-button view-button"
                      >
                        <Eye className="icon" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              )
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="crancy-table-bottom">
        <div className="dataTables_length">
          <Label htmlFor="itemsPerPageSelect" className="crancy-label">
            Showing{" "}
          </Label>
          <select
            id="itemsPerPageSelect"
            className="crancy-input form-input"
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="crancy-label-text"> of {totalRecords}</span>
        </div>

        <div className="crancy-pagination">
          <ul>
            <li>
              <Button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                variant="ghost"
                className="pagination-first-last"
              >
                <ChevronsLeft className="icon" />
              </Button>
            </li>
            <li>
              <Button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                variant="ghost"
                className="pagination-prev-next"
              >
                <ChevronLeft className="icon" />
              </Button>
            </li>
            {/* Page number indicators can be dynamic here, for simplicity showing current page */}
            <li>
              <Button
                variant="ghost"
                className="pagination-current-page active"
              >
                {currentPage}
              </Button>
            </li>
            <li>
              <Button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                variant="ghost"
                className="pagination-prev-next"
              >
                <ChevronRight className="icon" />
              </Button>
            </li>
            <li>
              <Button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                variant="ghost"
                className="pagination-first-last"
              >
                <ChevronsRight className="icon" />
              </Button>
            </li>
          </ul>
          <span className="pagination-info-pages"> of {totalPages} pages</span>
        </div>
      </div>
    </div>
  );
}
