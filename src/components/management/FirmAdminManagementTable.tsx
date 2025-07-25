"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { account, databases } from "@/lib/appwrite"; // Import Appwrite services
// CRITICAL FIX: Import ID directly, remove Models from value import
import { Query, Permission, Role, ID } from "appwrite";
import type { Models } from "appwrite"; // Keep Models for type checking only

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
  // Building, // Not directly used in this component's JSX
} from "lucide-react";

// Define interfaces for type safety, extending Models.Document for Appwrite
interface AppwriteProfile extends Models.Document {
  // This still correctly refers to Models.Document
  userId: string; // Appwrite User ID (matches Appwrite's current user $id)
  fullName: string | null;
  officialEmail: string;
  role: string;
  firmId: string | null; // Document ID of the firm (nullable)
}

interface FirmAdminProfileUpdate {
  fullName?: string | null; // Optional because not all fields are always updated
  officialEmail?: string; // Optional: though disabled in UI, define it
  role?: string;
  firmId?: string | null;
  // Add other profile attributes here that can be updated
}

interface Firm extends Models.Document {
  // This still correctly refers to Models.Document
  name: string;
  industry: string | null;
  contactEmail: string | null;
  phoneNumber: string | null;
  address: string | null;
}

// Interface for user data used internally by the component (fetched from user_profiles)
interface UserData {
  id: string; // Appwrite User ID
  email?: string; // from officialEmail
  role: string;
  firmId: string | null; // Firm Document ID
}

interface FirmAdminManagementTableProps {
  // No props from Astro page in this client-side protection model
}

export default function FirmAdminManagementTable({}: FirmAdminManagementTableProps) {
  const [firmAdmins, setFirmAdmins] = useState<AppwriteProfile[]>([]); // Use AppwriteProfile for state
  const [firms, setFirms] = useState<Firm[]>([]); // To populate firm dropdown for assignment
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null); // State for current user

  // State for Create/Edit Dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<AppwriteProfile | null>(
    null
  ); // Use AppwriteProfile for current admin
  // adminFormData includes email/password for new users, matching profile fields
  const [adminFormData, setAdminFormData] = useState<
    Partial<AppwriteProfile & { email: string; password?: string }>
  >({
    role: "firm_admin", // Default to firm_admin for this panel
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search and Pagination states
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Memoized filtered and paginated firm admins
  const filteredFirmAdmins = useMemo(() => {
    if (!searchTerm) {
      return firmAdmins;
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return firmAdmins.filter(
      (admin) =>
        admin.fullName?.toLowerCase().includes(lowerCaseSearchTerm) || // Use fullName
        admin.officialEmail.toLowerCase().includes(lowerCaseSearchTerm) ||
        // Safely access firm name for search
        firms
          .find((f) => f.$id === admin.firmId)
          ?.name?.toLowerCase()
          .includes(lowerCaseSearchTerm)
    );
  }, [firmAdmins, searchTerm, firms]);

  const paginatedFirmAdmins = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredFirmAdmins.slice(startIndex, endIndex);
  }, [filteredFirmAdmins, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredFirmAdmins.length / itemsPerPage);
  }, [filteredFirmAdmins, itemsPerPage]);

  // Fetches all firms (for dropdown) and firm admins (profiles with 'firm_admin' role)
  const fetchFirmAdminsAndFirms = useCallback(async () => {
    setLoading(true); // Keep loading true during data fetch
    setError(null);
    try {
      // Client-side check before fetching (Appwrite DB security rules enforce server-side)
      if (!currentUser || currentUser.role !== "super_admin") {
        console.warn(
          "Attempted to fetch firm admins without Super Admin role. Data fetching aborted."
        );
        setFirmAdmins([]); // Clear list
        setFirms([]); // Clear list
        return; // Abort fetch if not authorized
      }

      // Fetch all firms first (Super Admin has permission to all firms)
      const { documents: firmsDocuments } = await databases.listDocuments<Firm>(
        import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
        import.meta.env.PUBLIC_APPWRITE_FIRMS_COLLECTION_ID,
        [Query.orderAsc("name")]
      );
      setFirms(firmsDocuments || []);
      console.log("Fetched Firms for dropdown:", firmsDocuments);

      // Then fetch profiles with role 'firm_admin'
      const { documents: adminProfiles } =
        await databases.listDocuments<AppwriteProfile>(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID,
          [
            Query.equal("role", "firm_admin"), // Filter by role
            Query.orderAsc("fullName"), // Order by full name
          ]
        );
      setFirmAdmins(adminProfiles || []);
      console.log("Fetched Firm Admins (raw):", adminProfiles);
    } catch (err: any) {
      console.error("Error fetching firm admins or firms:", err.message);
      setError("Failed to load firm admins or firms: " + err.message);
      toast.error("Failed to load data: " + err.message);
    } finally {
      setLoading(false); // Set loading to false after data fetch attempt
    }
  }, [currentUser]); // Re-fetch when currentUser changes (e.g., after initial auth check)

  // Effect to perform initial authentication check and load data
  useEffect(() => {
    const checkAuthAndRole = async () => {
      setLoading(true); // Start loading for auth check
      setError(null);
      try {
        const currentAppwriteUser = await account.get(); // Get current logged-in user details
        console.log(
          "FirmAdminManagementTable: Appwrite User found:",
          currentAppwriteUser.$id
        );

        const userProfileResponse =
          await databases.listDocuments<AppwriteProfile>(
            import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
            import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID,
            [Query.equal("userId", currentAppwriteUser.$id), Query.limit(1)]
          );

        if (userProfileResponse.documents.length === 0) {
          console.error(
            "FirmAdminManagementTable: User profile document not found for user ID:",
            currentAppwriteUser.$id
          );
          await account.deleteSession("current");
          window.location.href = "/";
          return;
        }

        const profileData = userProfileResponse.documents[0];
        const fetchedUser: UserData = {
          id: profileData.userId, // Use userId from profile document
          email: profileData.officialEmail,
          role: profileData.role,
          firmId: profileData.firmId,
        };
        setCurrentUser(fetchedUser); // Set current user state

        if (fetchedUser.role !== "super_admin") {
          toast.error(
            "Access Denied: Only Super Admins can manage Firm Admins.",
            { autoClose: 3000 }
          );
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 3000);
          return;
        }

        console.log(
          "FirmAdminManagementTable: User is Super Admin. Access granted. Proceeding to fetch data."
        );
        // Data fetching will be triggered by the currentUser state update in the next useEffect
      } catch (err: any) {
        console.error(
          "FirmAdminManagementTable: Initial auth/role check failed:",
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
  }, []); // Runs once on mount for initial auth check

  // Effect to trigger data fetching once currentUser is successfully set and authorized
  useEffect(() => {
    if (currentUser && currentUser.role === "super_admin") {
      fetchFirmAdminsAndFirms();
    }
  }, [currentUser, fetchFirmAdminsAndFirms]); // Re-fetch when currentUser changes

  const handleCreateFirmAdmin = () => {
    setCurrentAdmin(null); // Clear for new admin
    setAdminFormData({
      role: "firm_admin", // Default to firm_admin for this panel
      fullName: "", // Match Appwrite attribute name
      officialEmail: "", // Match Appwrite attribute name
      firmId: null, // Match Appwrite attribute name
      password: "", // Password required for new user creation
    });
    setIsDialogOpen(true);
  };

  const handleEditFirmAdmin = (admin: AppwriteProfile) => {
    // Use AppwriteProfile type
    setCurrentAdmin(admin);
    setAdminFormData({
      fullName: admin.fullName, // Match Appwrite attribute name
      officialEmail: admin.officialEmail, // Match Appwrite attribute name
      role: admin.role,
      firmId: admin.firmId, // Match Appwrite attribute name
      password: "", // Never pre-fill password for security
    });
    setIsDialogOpen(true);
  };

  const handleDeleteFirmAdmin = async (
    adminDocId: string,
    adminEmail: string
  ) => {
    // Use document ID for delete
    if (
      !window.confirm(
        `Are you sure you want to delete Firm Admin "${adminEmail}"? This action will remove their profile and user account.`
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Delete the user_profiles document
      await databases.deleteDocument(
        import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
        import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID,
        adminDocId // Appwrite Document ID for profile
      );

      // 2. IMPORTANT: Deleting the user from Appwrite Auth
      // This part requires Appwrite's SERVER SDK or an Appwrite Function
      // You CANNOT delete users from Appwrite Auth directly from client-side JavaScript for security.
      // For a truly complete deletion, you would call an Appwrite Function here.
      // Example: await appwriteClient.functions.createExecution('deleteUserFunctionId', JSON.stringify({ userId: adminProfile.userId }));
      toast.warn(
        "User profile document deleted. Remember to manually delete the Appwrite user account for full cleanup."
      );
      toast.success(`Firm Admin "${adminEmail}" profile deleted successfully.`);
      fetchFirmAdminsAndFirms(); // Re-fetch data to update the list
    } catch (err: any) {
      console.error("Error deleting Firm Admin:", err.message);
      let userFacingMessage = "Failed to delete Firm Admin profile.";
      if (err.code === 409) {
        // Conflict
        userFacingMessage =
          "Cannot delete profile: It might be linked to active records or permissions prevent deletion.";
      }
      toast.error(userFacingMessage + (err.message ? ": " + err.message : ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { id, value } = e.target;
    // Special handling for firmId to convert empty string to null
    setAdminFormData((prev) => ({
      ...prev,
      [id]: value === "" ? null : value,
    }));
  };

  const handleSaveFirmAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Client-side validation
      if (!adminFormData.fullName || !adminFormData.officialEmail) {
        // Use fullName, officialEmail
        toast.error("Full Name and Official Email are required.");
        setIsSubmitting(false);
        return;
      }
      if (!currentAdmin && !adminFormData.password) {
        toast.error("Password is required for new Firm Admin accounts.");
        setIsSubmitting(false);
        return;
      }

      // Check if trying to create Firm Admin without assigning a firm
      if (adminFormData.role === "firm_admin" && !adminFormData.firmId) {
        // Use firmId
        toast.error("Firm Admins must be assigned to a firm.");
        setIsSubmitting(false);
        return;
      }

      if (!currentAdmin) {
        // --- Create New Appwrite User AND Create User Profile Document ---
        // 1. Create the user in Appwrite Auth
        // Appwrite v1.x create method can take unique() as ID or specific ID.
        // It's safer to let Appwrite generate the Auth User ID ($id)
        const newAuthUser = await account.create(
          ID.unique(), // CRITICAL FIX: Use ID.unique()
          adminFormData.officialEmail,
          adminFormData.password!,
          adminFormData.fullName || undefined // Optional fullName
        );

        console.log("Created new Appwrite Auth User:", newAuthUser.$id);

        // 2. Create the user_profiles document with the correct role and firmId
        const newProfileDocument = await databases.createDocument(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID,
          ID.unique(), // CRITICAL FIX: Use ID.unique() for document ID
          {
            userId: newAuthUser.$id, // Link to Appwrite Auth User ID
            fullName: adminFormData.fullName,
            officialEmail: adminFormData.officialEmail,
            role: adminFormData.role, // This will be 'firm_admin'
            firmId: adminFormData.firmId || null, // Match Appwrite attribute name
          },
          [
            Permission.read(Role.users()),
            Permission.write(Role.users()),
            Permission.delete(Role.users()),
          ]
        );
        console.log(
          "Created new User Profile Document:",
          newProfileDocument.$id
        );
      } else {
        const updateData: Partial<FirmAdminProfileUpdate> = {
          fullName: adminFormData.fullName,
          firmId: adminFormData.firmId || null,
          role: adminFormData.role,
        };
        await databases.updateDocument(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID,
          currentAdmin.$id,
          updateData
        );
      }

      toast.success(
        currentAdmin
          ? "Firm Admin updated successfully."
          : "Firm Admin created successfully."
      );
      setIsDialogOpen(false);
      fetchFirmAdminsAndFirms(); // Re-fetch data to update the list
    } catch (err: any) {
      console.error("Error saving Firm Admin:", err.message);
      let userFacingMessage = "Failed to save Firm Admin.";
      if (
        err.code === 409 &&
        err.message.includes("document_attribute_unique")
      ) {
        userFacingMessage = "Email or User ID already exists in profile.";
      } else if (
        err.code === 409 &&
        err.message.includes("user_email_already_exists")
      ) {
        // Appwrite Auth specific error
        userFacingMessage =
          "An account with this email already exists in Appwrite Auth.";
      } else if (err.code === 400 && err.message.includes("Invalid `userId`")) {
        userFacingMessage =
          "Invalid User ID provided for Appwrite Auth. This should be unique.";
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
          onClick={fetchFirmAdminsAndFirms}
          className="crancy-btn button--primary retry-button"
        >
          <RefreshCw className="icon" />
          <span>Retry Load</span>
        </Button>
      </div>
    );
  }

  if (currentUser.role !== "super_admin") {
    return null; // The useEffect handles the actual redirection with a delay and toast
  }

  return (
    <div className="firm-management-container">
      <div className="firm-management-header">
        <h1 className="firm-management-title">Firm Admin Management</h1>
        <Button
          onClick={handleCreateFirmAdmin}
          className="crancy-btn button--primary button--large add-firm-button"
        >
          <PlusCircle className="icon" />
          <span>Add New Firm Admin</span>
        </Button>
      </div>

      <Card className="crancy-card firm-list-card">
        <CardHeader className="card-header">
          <CardTitle className="card-title">List of Firm Admins</CardTitle>
          <div className="search-input-wrapper">
            <Input
              type="text"
              placeholder="Search firm admins..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="crancy-input search-input"
            />
            <Search className="search-icon" />
          </div>
        </CardHeader>
        <CardContent className="card-content">
          {filteredFirmAdmins.length === 0 &&
          !loading &&
          !error &&
          !searchTerm ? (
            <p className="empty-state-message">
              No Firm Admins found. Click "Add New Firm Admin" to get started.
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
                        Assigned Firm
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell--actions">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="crancy-table-body firm-table-body">
                    {paginatedFirmAdmins.length === 0 && searchTerm ? (
                      <TableRow>
                        {" "}
                        {/* CRITICAL: Wrap in TableRow */}
                        <TableCell
                          colSpan={4}
                          className="empty-results-message"
                        >
                          No results found for "{searchTerm}".
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedFirmAdmins.map(
                        (
                          admin // CRITICAL: Map paginatedFirmAdmins
                        ) => (
                          <TableRow key={admin.$id} className="firm-table-row">
                            {" "}
                            {/* Use admin.$id for key */}
                            <TableCell className="crancy-table-cell table-cell table-cell--name">
                              {admin.fullName || "N/A"}
                            </TableCell>{" "}
                            {/* Use fullName */}
                            <TableCell className="crancy-table-cell table-cell">
                              {admin.officialEmail}
                            </TableCell>{" "}
                            {/* Use officialEmail */}
                            <TableCell className="crancy-table-cell table-cell">
                              {firms.find((f) => f.$id === admin.firmId)
                                ?.name || // Use firm.$id and admin.firmId
                                "N/A"}
                            </TableCell>
                            <TableCell className="crancy-table-cell table-cell--actions">
                              <Button
                                onClick={() => handleEditFirmAdmin(admin)}
                                className="crancy-btn button--outline button--small action-button edit-button"
                              >
                                <Edit className="icon" /> Edit
                              </Button>
                              {/* Prevent Super Admin from deleting themselves */}
                              {currentUser &&
                                admin.userId !== currentUser.id && ( // Compare Appwrite user IDs
                                  <Button
                                    onClick={() =>
                                      handleDeleteFirmAdmin(
                                        admin.$id, // Pass Appwrite Document ID
                                        admin.officialEmail
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
                        )
                      )
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {filteredFirmAdmins.length > itemsPerPage && (
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

      {/* Create/Edit Firm Admin Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="dialog-content">
          <DialogHeader className="dialog-header">
            <div className="dialog-text-content">
              <DialogTitle className="dialog-title-text">
                {currentAdmin ? "Edit Firm Admin" : "Add New Firm Admin"}
              </DialogTitle>
              <DialogDescription className="dialog-description-text">
                {currentAdmin
                  ? "Make changes to the Firm Admin details here."
                  : "Create a new Firm Admin account."}
              </DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={handleSaveFirmAdmin} className="dialog-form">
            <div className="form-group">
              <Label htmlFor="fullName" className="crancy-label form-label">
                {" "}
                {/* Use fullName */}
                Full Name*
              </Label>
              <Input
                id="fullName" // Use fullName
                value={adminFormData.fullName || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
              />
            </div>
            <div className="form-group">
              <Label
                htmlFor="officialEmail" // Use officialEmail
                className="crancy-label form-label"
              >
                Official Email*
              </Label>
              <Input
                id="officialEmail" // Use officialEmail
                type="email"
                value={adminFormData.officialEmail || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
                disabled={!!currentAdmin} // Disable email edit for existing admins
              />
            </div>
            {!currentAdmin && ( // Password field only for new admins
              <div className="form-group">
                <Label htmlFor="password" className="crancy-label form-label">
                  Password*
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={adminFormData.password || ""}
                  onChange={handleFormChange}
                  className="crancy-input form-input"
                  required
                />
              </div>
            )}
            <div className="form-group">
              <Label htmlFor="firmId" className="crancy-label form-label">
                Assign Firm*
              </Label>
              <select
                id="firmId" // Use firmId
                value={adminFormData.firmId || ""}
                onChange={handleFormChange}
                className="crancy-input form-input" // Apply input styles to select
                required
              >
                <option value="">Select a Firm</option>
                {firms.map((firm) => (
                  <option key={firm.$id} value={firm.$id}>
                    {firm.name}
                  </option>
                ))}
              </select>
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
                  currentAdmin ? (
                    <>
                      <Loader2 className="icon-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Loader2 className="icon-spin" /> Creating...
                    </>
                  )
                ) : currentAdmin ? (
                  "Save Changes"
                ) : (
                  "Create Firm Admin"
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
