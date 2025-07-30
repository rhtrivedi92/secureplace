"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { account, databases } from "@/lib/appwrite";
import { Query, Permission, Role, ID } from "appwrite"; // Import Query, Permission, Role, ID
import type { Models } from "appwrite";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  Search,
  PlusCircle,
  Edit,
  Trash2,
  Loader2,
  RefreshCw,
  User,
  Building,
  Phone,
  Mail,
  Droplet,
  CalendarDays,
  Venus,
  Mars,
  HandHelping,
} from "lucide-react";

// Define interfaces for type safety, extending Models.Document for Appwrite
interface AppwriteProfile extends Models.Document {
  userId: string;
  fullName: string | null;
  officialEmail: string;
  role: string; // 'employee', 'security', 'volunteer'
  firmId: string | null;
  contactNumber?: string | null;
  emergencyContactNumber?: string | null;
  bloodGroup?: string | null;
  ageGroup?: string | null;
  gender?: string | null;
  isVolunteer?: boolean;
  locationId?: string | null; // NEW: Associate employee with a location
}

// Firm interface (for dropdown)
interface Firm extends Models.Document {
  name: string;
  // Only name is strictly needed for display
}

// Location interface (for dropdown)
interface AppwriteLocation extends Models.Document {
  name: string;
  address: string | null;
  firmId: string;
  latitude?: number | null;
  longitude?: number | null;
}

// Interface for user data used internally by the component (fetched from user_profiles)
interface UserData {
  id: string; // Appwrite User ID
  email?: string;
  role: string;
  firmId: string | null; // Firm Document ID of the current Firm Admin
}

// Interface for attributes that can be updated for an employee profile
interface EmployeeProfileUpdate {
  fullName?: string | null;
  officialEmail?: string;
  role?: string;
  firmId?: string | null;
  contactNumber?: string | null;
  emergencyContactNumber?: string | null;
  bloodGroup?: string | null;
  ageGroup?: string | null;
  gender?: string | null;
  isVolunteer?: boolean;
  locationId?: string | null; // NEW: Updateable locationId
}

interface EmployeeManagementTableProps {
  // No props from Astro page in this client-side protection model
}

export default function EmployeeManagementTable({}: EmployeeManagementTableProps) {
  const [employees, setEmployees] = useState<AppwriteProfile[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]); // For displaying firm names in table
  const [locations, setLocations] = useState<AppwriteLocation[]>([]); // NEW: For location filter and form dropdown
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null); // State for current Firm Admin

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentEmployee, setCurrentEmployee] =
    useState<AppwriteProfile | null>(null);
  const [employeeFormData, setEmployeeFormData] = useState<
    Partial<AppwriteProfile & { email: string; password?: string }>
  >({
    role: "employee", // Default to 'employee' for new records
    isVolunteer: false,
    locationId: null, // NEW: Default to null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [selectedLocationFilter, setSelectedLocationFilter] =
    useState<string>(""); // NEW: State for location filter

  // Appwrite Collection IDs (centralize for clarity)
  const DATABASE_ID = import.meta.env.PUBLIC_APPWRITE_DATABASE_ID;
  const USER_PROFILES_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID;
  const FIRMS_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_FIRMS_COLLECTION_ID;
  const LOCATIONS_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_LOCATIONS_COLLECTION_ID; // NEW

  // Memoized filtered and paginated employees
  const filteredEmployees = useMemo(() => {
    let filtered = employees;

    // Apply search term filter
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (employee) =>
          employee.fullName?.toLowerCase().includes(lowerCaseSearchTerm) ||
          employee.officialEmail.toLowerCase().includes(lowerCaseSearchTerm) ||
          employee.role.toLowerCase().includes(lowerCaseSearchTerm) ||
          employee.firmId?.toLowerCase().includes(lowerCaseSearchTerm)
      );
    }

    // NEW: Apply location filter
    if (selectedLocationFilter) {
      filtered = filtered.filter(
        (employee) => employee.locationId === selectedLocationFilter
      );
    }

    return filtered;
  }, [employees, searchTerm, selectedLocationFilter]); // Added selectedLocationFilter to dependencies

  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEmployees.slice(startIndex, endIndex);
  }, [filteredEmployees, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredEmployees.length / itemsPerPage);
  }, [filteredEmployees, itemsPerPage]);

  // Fetches employees for the current Firm Admin's firm, and also locations for the dropdown/filter
  const fetchEmployeesAndRelatedData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (
        !currentUser ||
        currentUser.role !== "firm_admin" ||
        !currentUser.firmId
      ) {
        console.warn(
          "Attempted to fetch employees without valid Firm Admin context. Aborting."
        );
        setEmployees([]);
        setFirms([]); // Clear firms list too
        setLocations([]); // Clear locations too
        return;
      }

      // Fetch the specific firm data needed for display (by Firm Admin's firmId)
      const { documents: firmDocuments } = await databases.listDocuments<Firm>(
        DATABASE_ID,
        FIRMS_COLLECTION_ID,
        // CRITICAL FIX: Combine queries into one array
        [
          Query.equal("$id", currentUser.firmId), // Filter by current user's firm ID
          Query.limit(1), // Limit to 1 document as we only expect one firm
        ]
      );
      setFirms(firmDocuments || []);
      console.log("Fetched Firm for current admin:", firmDocuments);

      // NEW: Fetch locations for the current Firm Admin's firm
      const { documents: locationDocuments } =
        await databases.listDocuments<AppwriteLocation>(
          DATABASE_ID,
          LOCATIONS_COLLECTION_ID,
          [
            Query.equal("firmId", currentUser.firmId), // Filter locations by firmId
            Query.orderAsc("name"),
          ]
        );
      setLocations(locationDocuments || []);
      console.log("Fetched Locations for dropdown/filter:", locationDocuments);

      // Fetch profiles with role 'employee', 'security', 'volunteer' from the current Firm Admin's firm
      const { documents: employeeProfiles } =
        await databases.listDocuments<AppwriteProfile>(
          DATABASE_ID,
          USER_PROFILES_COLLECTION_ID,
          [
            Query.equal("firmId", currentUser.firmId), // CRITICAL: Filter by the Firm Admin's firmId
            Query.or([
              Query.equal("role", "employee"),
              Query.equal("role", "security"),
              Query.equal("role", "volunteer"),
            ]), // Include other roles managed by Firm Admin
            Query.orderAsc("fullName"),
          ]
        );
      setEmployees(employeeProfiles || []);
      console.log("Fetched Employees for firm:", employeeProfiles);
    } catch (err: any) {
      console.error("Error fetching employees or related data:", err.message);
      setError("Failed to load employees or related data: " + err.message);
      toast.error("Failed to load data: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [
    currentUser,
    DATABASE_ID,
    USER_PROFILES_COLLECTION_ID,
    FIRMS_COLLECTION_ID,
    LOCATIONS_COLLECTION_ID,
  ]);

  // Effect to perform initial authentication check and load data (unchanged)
  useEffect(() => {
    const checkAuthAndRole = async () => {
      setLoading(true);
      setError(null);
      try {
        const currentAppwriteUser = await account.get(); // Get current logged-in user details
        console.log(
          "EmployeeManagementTable: Appwrite User found:",
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
            "EmployeeManagementTable: User profile document not found for user ID:",
            currentAppwriteUser.$id
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
          // This page is for Firm Admins
          toast.error("Access Denied: Only Firm Admins can manage employees.", {
            autoClose: 3000,
          });
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 3000);
          return;
        }
        if (!fetchedUser.firmId) {
          // Firm Admin must be assigned a firm
          toast.error(
            "Firm Admin not assigned to a firm. Please contact your Super Admin.",
            { autoClose: 3000 }
          );
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 3000);
          return;
        }

        console.log(
          "EmployeeManagementTable: User is Firm Admin and assigned to firm. Access granted. Proceeding to fetch employees and related data."
        );
      } catch (err: any) {
        console.error(
          "EmployeeManagementTable: Initial auth/role check failed:",
          err.message
        );
        setError("Authentication check failed. Please try logging in again.");
        toast.error("Authentication failed: " + err.message);
        setLoading(false);
        setTimeout(() => {
          window.location.href = "/";
        }, 3000);
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
      fetchEmployeesAndRelatedData();
    }
  }, [currentUser, fetchEmployeesAndRelatedData]);

  const handleCreateEmployee = () => {
    setCurrentEmployee(null); // Clear for new employee
    setEmployeeFormData({
      role: "employee", // Default to 'employee' for new creation
      fullName: "",
      officialEmail: "",
      firmId: currentUser?.firmId || null, // Pre-fill with current Firm Admin's firmId
      password: "",
      isVolunteer: false,
      contactNumber: null,
      emergencyContactNumber: null,
      bloodGroup: null,
      ageGroup: null,
      gender: null,
      locationId: null, // NEW: Default to null for new employee
    });
    setIsDialogOpen(true);
  };

  const handleEditEmployee = (employee: AppwriteProfile) => {
    setCurrentEmployee(employee);
    setEmployeeFormData({
      ...employee, // Spread existing data
      password: "", // Never pre-fill password for security
    });
    setIsDialogOpen(true);
  };

  const handleDeleteEmployee = async (
    employeeDocId: string,
    employeeEmail: string
  ) => {
    if (
      !window.confirm(
        `Are you sure you want to delete employee "${employeeEmail}"? This action will remove their profile document.`
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        USER_PROFILES_COLLECTION_ID,
        employeeDocId // Appwrite Document ID
      );

      toast.warn(
        "Employee profile document deleted. Remember to manually delete the Appwrite user account for full cleanup."
      );
      toast.success(
        `Employee "${employeeEmail}" profile deleted successfully.`
      );
      fetchEmployeesAndRelatedData(); // Re-fetch data
    } catch (err: any) {
      console.error("Error deleting employee:", err.message);
      let userFacingMessage = "Failed to delete employee profile.";
      if (err.code === 409) {
        // Conflict
        userFacingMessage =
          "Cannot delete: This employee is linked to other records or permissions prevent deletion.";
      }
      toast.error(userFacingMessage + (err.message ? ": " + err.message : ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { id, value, type, checked } = e.target as HTMLInputElement;
    setEmployeeFormData((prev) => ({
      ...prev,
      [id]: type === "checkbox" ? checked : value === "" ? null : value,
    }));
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (
        !employeeFormData.fullName ||
        !employeeFormData.officialEmail ||
        !employeeFormData.role
      ) {
        toast.error("Full Name, Official Email, and Role are required.");
        setIsSubmitting(false);
        return;
      }
      if (!currentEmployee && !employeeFormData.password) {
        toast.error("Password is required for new employee accounts.");
        setIsSubmitting(false);
        return;
      }
      if (!currentUser || !currentUser.firmId) {
        toast.error("Firm Admin's firm ID not found. Cannot save employee.");
        setIsSubmitting(false);
        return;
      }
      // Ensure the employee being created/updated belongs to the Firm Admin's firm
      employeeFormData.firmId = currentUser.firmId;

      if (!currentEmployee) {
        // --- Create New Appwrite User AND Create Employee Profile Document ---
        const newAuthUser = await account.create(
          ID.unique(),
          employeeFormData.officialEmail,
          employeeFormData.password!,
          employeeFormData.fullName || undefined
        );

        console.log("Created new Appwrite Auth User:", newAuthUser.$id);

        await databases.createDocument(
          DATABASE_ID,
          USER_PROFILES_COLLECTION_ID,
          ID.unique(),
          {
            userId: newAuthUser.$id,
            fullName: employeeFormData.fullName,
            officialEmail: employeeFormData.officialEmail,
            role: employeeFormData.role,
            firmId: currentUser.firmId, // Assign to current Firm Admin's firm
            contactNumber: employeeFormData.contactNumber || null,
            emergencyContactNumber:
              employeeFormData.emergencyContactNumber || null,
            bloodGroup: employeeFormData.bloodGroup || null,
            ageGroup: employeeFormData.ageGroup || null,
            gender: employeeFormData.gender || null,
            isVolunteer: employeeFormData.isVolunteer || false,
            locationId: employeeFormData.locationId || null, // NEW: Save locationId
          },
          [
            // Permissions for this new profile document:
            Permission.read(Role.user(newAuthUser.$id)), // Employee can read own profile
            Permission.update(Role.user(newAuthUser.$id)), // Employee can update own profile
            Permission.read(Role.users()), // Any authenticated user can read (e.g., other employees for directory, admins)
            Permission.update(Role.users()), // Admins can update
            Permission.delete(Role.users()), // Admins can delete
          ]
        );
      } else {
        // --- Update Existing Employee Profile Document ---
        const updateData: EmployeeProfileUpdate = {
          fullName: employeeFormData.fullName,
          officialEmail: employeeFormData.officialEmail,
          role: employeeFormData.role,
          firmId: currentUser.firmId, // Ensure it remains linked to current firm (Firm Admin scope)
          contactNumber: employeeFormData.contactNumber || null,
          emergencyContactNumber:
            employeeFormData.emergencyContactNumber || null,
          bloodGroup: employeeFormData.bloodGroup || null,
          ageGroup: employeeFormData.ageGroup || null,
          gender: employeeFormData.gender || null,
          isVolunteer: employeeFormData.isVolunteer || false,
          locationId: employeeFormData.locationId || null, // NEW: Update locationId
        };
        await databases.updateDocument(
          DATABASE_ID,
          USER_PROFILES_COLLECTION_ID,
          currentEmployee.$id, // Use Appwrite document ID
          updateData
        );
      }

      toast.success(
        currentEmployee
          ? "Employee updated successfully."
          : "Employee created successfully."
      );
      setIsDialogOpen(false);
      fetchEmployeesAndRelatedData(); // Re-fetch data
    } catch (err: any) {
      console.error("Error saving Employee:", err.message);
      let userFacingMessage = "Failed to save Employee.";
      if (
        err.code === 409 &&
        err.message.includes("user_email_already_exists")
      ) {
        userFacingMessage =
          "An account with this email already exists in Appwrite Auth.";
      } else if (
        err.code === 409 &&
        err.message.includes("document_attribute_unique")
      ) {
        userFacingMessage =
          "Profile with this email or User ID already exists.";
      }
      toast.error(userFacingMessage + (err.message ? ": " + err.message : ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  // --- Conditional Rendering for Loading/Error/Unauthorized States ---
  if (loading || !currentUser) {
    return (
      <div className="admin-loading-screen">
        <Loader2 className="loading-spinner" />
        <p className="loading-text">Verifying access...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-error-screen">
        <p className="error-message">Error: {error}</p>
        <Button
          onClick={fetchEmployeesAndRelatedData}
          className="crancy-btn button--primary retry-button"
        >
          <RefreshCw className="icon" />
          <span>Retry Load</span>
        </Button>
      </div>
    );
  }

  // Hide component if not a Firm Admin (redirect handled by useEffect)
  if (currentUser.role !== "firm_admin") {
    return null;
  }
  // Also hide if Firm Admin is not assigned a firm
  if (!currentUser.firmId) {
    return (
      <div className="admin-error-screen">
        <p className="error-message">
          Firm Admin not assigned to a firm. Please contact your Super Admin.
        </p>
        <Button
          onClick={() => (window.location.href = "/dashboard")}
          className="crancy-btn button--primary retry-button"
        >
          <span>Go to Dashboard</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="firm-management-container">
      <div className="firm-management-header">
        <h1 className="firm-management-title">Employee Management</h1>
        <Button
          onClick={handleCreateEmployee}
          className="crancy-btn button--primary button--large add-firm-button"
        >
          <PlusCircle className="icon" />
          <span>Add New Employee</span>
        </Button>
      </div>

      <Card className="crancy-card firm-list-card">
        <CardHeader className="card-header">
          <CardTitle className="card-title">List of Employees</CardTitle>
          <div className="search-input-wrapper">
            <Input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="crancy-input search-input"
            />
            <Search className="icon search-icon" />
          </div>
          {/* NEW: Location Filter Dropdown */}
          <div className="location-filter-wrapper">
            <Label htmlFor="locationFilter" className="crancy-label form-label">
              Filter by Location:
            </Label>
            <select
              id="locationFilter"
              value={selectedLocationFilter}
              onChange={(e) => {
                setSelectedLocationFilter(e.target.value);
                setCurrentPage(1); // Reset page when filter changes
              }}
              className="crancy-input form-input filter-select"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.$id} value={loc.$id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="card-content">
          {filteredEmployees.length === 0 &&
          !loading &&
          !error &&
          !searchTerm &&
          !selectedLocationFilter ? (
            <p className="empty-state-message">
              No employees found for your firm. Click "Add New Employee" to get
              started.
            </p>
          ) : (
            <>
              <div className="table-responsive">
                <Table className="crancy-table firm-table">
                  <TableHeader className="crancy-table-header firm-table-header">
                    <TableRow>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Full Name
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Official Email
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Role
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Location
                      </TableHead>{" "}
                      {/* NEW Column */}
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Contact
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Blood Group
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Volunteer
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell--actions">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="crancy-table-body firm-table-body">
                    {paginatedEmployees.length === 0 &&
                    (searchTerm || selectedLocationFilter) ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="empty-results-message"
                        >
                          {" "}
                          {/* Adjusted colSpan */}
                          No results found for "{searchTerm}"{" "}
                          {selectedLocationFilter
                            ? `in selected location.`
                            : ""}
                          .
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedEmployees.map((employee) => (
                        <TableRow key={employee.$id} className="firm-table-row">
                          <TableCell className="crancy-table-cell table-cell table-cell--name">
                            {employee.fullName || "N/A"}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {employee.officialEmail}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {employee.role}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {locations.find(
                              (loc) => loc.$id === employee.locationId
                            )?.name || "N/A"}{" "}
                            {/* NEW: Display location name */}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            <span className="flex items-center gap-1">
                              <Phone className="icon icon--small" />{" "}
                              {employee.contactNumber || "N/A"}
                            </span>
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            <span className="flex items-center gap-1">
                              <Droplet className="icon icon--small" />{" "}
                              {employee.bloodGroup || "N/A"}
                            </span>
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {employee.isVolunteer ? (
                              <HandHelping className="icon icon--small icon--volunteer" />
                            ) : (
                              "No"
                            )}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell--actions">
                            <Button
                              onClick={() => handleEditEmployee(employee)}
                              className="crancy-btn button--outline button--small action-button edit-button"
                            >
                              <Edit className="icon" /> Edit
                            </Button>
                            {currentUser &&
                              employee.userId !== currentUser.id && ( // Prevent Firm Admin from deleting themselves
                                <Button
                                  onClick={() =>
                                    handleDeleteEmployee(
                                      employee.$id,
                                      employee.officialEmail
                                    )
                                  }
                                  disabled={isSubmitting}
                                  className="crancy-btn button--destructive button--small action-button delete-button"
                                >
                                  <Trash2 className="icon" /> Delete
                                </Button>
                              )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {filteredEmployees.length > itemsPerPage && (
                <div className="pagination-controls">
                  <Button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1 || isSubmitting}
                    className="crancy-btn button--outline pagination-button"
                  >
                    Previous
                  </Button>
                  <span className="pagination-info">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages || isSubmitting}
                    className="crancy-btn button--outline pagination-button"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Employee Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="dialog-content">
          <DialogHeader className="dialog-header">
            <div className="dialog-text-content">
              <DialogTitle className="dialog-title-text">
                {currentEmployee ? "Edit Employee" : "Add New Employee"}
              </DialogTitle>
              <DialogDescription className="dialog-description-text">
                {currentEmployee
                  ? "Update employee details here."
                  : "Create a new employee account for your firm."}
              </DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={handleSaveEmployee} className="dialog-form">
            <div className="form-group">
              <Label htmlFor="fullName" className="crancy-label form-label">
                Full Name*
              </Label>
              <Input
                id="fullName"
                value={employeeFormData.fullName || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
              />
            </div>
            <div className="form-group">
              <Label
                htmlFor="officialEmail"
                className="crancy-label form-label"
              >
                Official Email*
              </Label>
              <Input
                id="officialEmail"
                type="email"
                value={employeeFormData.officialEmail || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
                disabled={!!currentEmployee} // Disable email edit for existing
              />
            </div>
            {!currentEmployee && (
              <div className="form-group">
                <Label htmlFor="password" className="crancy-label form-label">
                  Password*
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={employeeFormData.password || ""}
                  onChange={handleFormChange}
                  className="crancy-input form-input"
                  required
                />
              </div>
            )}
            <div className="form-group">
              <Label htmlFor="role" className="crancy-label form-label">
                Role*
              </Label>
              <select
                id="role"
                value={employeeFormData.role || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
              >
                <option value="employee">Employee</option>
                <option value="security">Security</option>
                <option value="volunteer">Volunteer</option>
              </select>
            </div>
            {/* NEW: Location Dropdown in Form */}
            <div className="form-group">
              <Label htmlFor="locationId" className="crancy-label form-label">
                Assigned Location
              </Label>
              <select
                id="locationId"
                value={employeeFormData.locationId || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
              >
                <option value="">No Location Assigned</option>
                {locations.map((loc) => (
                  <option key={loc.$id} value={loc.$id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Additional employee attributes */}
            <div className="form-group">
              <Label
                htmlFor="contactNumber"
                className="crancy-label form-label"
              >
                Contact Number
              </Label>
              <Input
                id="contactNumber"
                value={employeeFormData.contactNumber || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                type="tel"
              />
            </div>
            <div className="form-group">
              <Label
                htmlFor="emergencyContactNumber"
                className="crancy-label form-label"
              >
                Emergency Contact
              </Label>
              <Input
                id="emergencyContactNumber"
                value={employeeFormData.emergencyContactNumber || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                type="tel"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="bloodGroup" className="crancy-label form-label">
                Blood Group
              </Label>
              <Input
                id="bloodGroup"
                value={employeeFormData.bloodGroup || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="ageGroup" className="crancy-label form-label">
                Age Group
              </Label>
              <Input
                id="ageGroup"
                value={employeeFormData.ageGroup || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="gender" className="crancy-label form-label">
                Gender
              </Label>
              <select
                id="gender"
                value={employeeFormData.gender || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
              >
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group form-group--checkbox">
              <Label htmlFor="isVolunteer" className="crancy-label form-label">
                Volunteer
              </Label>
              <Input
                id="isVolunteer"
                type="checkbox"
                checked={employeeFormData.isVolunteer || false}
                onChange={handleFormChange}
                className="crancy-input form-checkbox"
              />
            </div>

            <DialogFooter className="dialog-footer">
              <Button
                type="button"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
                className="crancy-btn button--outline cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="crancy-btn button--primary save-button"
              >
                {isSubmitting ? (
                  currentEmployee ? (
                    <>
                      <Loader2 className="icon-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Loader2 className="icon-spin" /> Creating...
                    </>
                  )
                ) : currentEmployee ? (
                  "Save Changes"
                ) : (
                  "Create Employee"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
