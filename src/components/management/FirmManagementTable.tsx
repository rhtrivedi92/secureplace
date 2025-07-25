"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { account, databases } from "@/lib/appwrite"; // Import Appwrite services
import { Query, Permission, Role } from "appwrite"; // Import Permission and Role
import type { Models } from "appwrite"; // Import Models for Appwrite document types
import { toast, ToastContainer } from "react-toastify";
import { Button } from "../ui/button";
import {
  Edit,
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";

// Define interfaces for type safety, extending Models.Document for Appwrite
interface Firm extends Models.Document {
  name: string;
  industry: string | null;
  contactEmail: string | null;
  phoneNumber: string | null;
  address: string | null;
  // Appwrite will automatically add $id, $createdAt, $updatedAt etc.
}

// Interface for user data used internally by the component (fetched from user_profiles)
interface UserData {
  id: string; // Appwrite User ID
  email?: string; // from officialEmail
  role: string;
  firmId: string | null; // Firm Document ID
}

// Interface for user profile data fetched from Appwrite Database (matching user_profiles collection)
interface AppwriteProfile extends Models.Document {
  userId: string;
  fullName: string | null;
  officialEmail: string;
  role: string;
  firmId: string | null;
}

interface FirmManagementTableProps {
  // No props from Astro page in this client-side protection model
}

export default function FirmManagementTable({}: FirmManagementTableProps) {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null); // State for current user

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentFirm, setCurrentFirm] = useState<Firm | null>(null);
  const [firmFormData, setFirmFormData] = useState<Partial<Firm>>({
    name: "",
    industry: null,
    contactEmail: null,
    phoneNumber: null,
    address: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const filteredFirms = useMemo(() => {
    if (!searchTerm) {
      return firms;
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return firms.filter(
      (firm) =>
        firm.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        firm.contactEmail?.toLowerCase().includes(lowerCaseSearchTerm) ||
        firm.industry?.toLowerCase().includes(lowerCaseSearchTerm) ||
        firm.address?.toLowerCase().includes(lowerCaseSearchTerm) ||
        firm.phoneNumber?.includes(lowerCaseSearchTerm)
    );
  }, [firms, searchTerm]);

  const paginatedFirms = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredFirms.slice(startIndex, endIndex);
  }, [filteredFirms, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredFirms.length / itemsPerPage);
  }, [filteredFirms, itemsPerPage]);

  const fetchFirms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!currentUser || currentUser.role !== "super_admin") {
        console.warn(
          "Attempted to fetch firms without Super Admin role. Data fetching aborted."
        );
        setFirms([]); // Clear list
        return;
      }

      const { documents, total } = await databases.listDocuments<Firm>(
        import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
        import.meta.env.PUBLIC_APPWRITE_FIRMS_COLLECTION_ID,
        [Query.orderAsc("name")]
      );

      setFirms(documents || []);
      console.log("Fetched Firms:", documents); // Debugging
    } catch (err: any) {
      console.error("Error fetching firms:", err.message);
      setError("Failed to load firms: " + err.message);
      toast.error("Failed to load firms: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    const checkAuthAndRole = async () => {
      setLoading(true);
      setError(null);
      try {
        const currentAppwriteUser = await account.get();
        console.log(
          "FirmManagementTable: Appwrite User found:",
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
            "FirmManagementTable: User profile document not found for user ID:",
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

        if (fetchedUser.role !== "super_admin") {
          toast.error("Access Denied: Only Super Admins can manage Firms.", {
            autoClose: 3000,
          });
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 3000);
          return;
        }

        console.log(
          "FirmManagementTable: User is Super Admin. Access granted. Proceeding to fetch firms."
        );
      } catch (err: any) {
        console.error(
          "FirmManagementTable: Initial auth/role check failed:",
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
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.role === "super_admin") {
      fetchFirms();
    }
  }, [currentUser, fetchFirms]);

  const handleCreateFirm = () => {
    setCurrentFirm(null);
    setFirmFormData({
      name: "",
      industry: null,
      contactEmail: null,
      phoneNumber: null,
      address: null,
    });
    setIsDialogOpen(true);
  };

  const handleEditFirm = (firm: Firm) => {
    setCurrentFirm(firm);
    setFirmFormData({
      name: firm.name,
      industry: firm.industry,
      contactEmail: firm.contactEmail,
      phoneNumber: firm.phoneNumber,
      address: firm.address,
    });
    setIsDialogOpen(true);
  };

  const handleDeleteFirm = async (firmId: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete this firm? This action cannot be undone.`
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      await databases.deleteDocument(
        import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
        import.meta.env.PUBLIC_APPWRITE_FIRMS_COLLECTION_ID,
        firmId
      );

      toast.success("Firm deleted successfully.");
      fetchFirms();
    } catch (err: any) {
      console.error("Error deleting firm:", err.message);
      let userFacingMessage = "Failed to delete firm.";
      if (err.code === 409) {
        // Conflict
        userFacingMessage =
          "Cannot delete firm: It might be linked to existing Firm Admins or Locations.";
      }
      toast.error(userFacingMessage + (err.message ? ": " + err.message : ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { id, value } = e.target;
    setFirmFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSaveFirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (!firmFormData.name || !firmFormData.contactEmail) {
        toast.error("Firm Name and Contact Email are required.");
        setIsSubmitting(false);
        return;
      }

      const firmDataToSave = {
        name: firmFormData.name,
        industry: firmFormData.industry || null,
        contactEmail: firmFormData.contactEmail,
        phoneNumber: firmFormData.phoneNumber || null,
        address: firmFormData.address || null,
      };

      if (!currentFirm) {
        // Create new firm document in Appwrite with explicit permissions
        await databases.createDocument(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_FIRMS_COLLECTION_ID,
          "unique()", // Let Appwrite generate a unique ID
          firmDataToSave,
          [
            // --- CRITICAL FIX: Use Appwrite's new Permission/Role syntax ---
            Permission.read(Role.users()), // Any authenticated user can read
            Permission.write(Role.users()), // Any authenticated user can write (Super Admin will be one of these users)
            // You can make it more granular if needed, e.g., only specific roles or users
            // Permission.write(Role.user(currentUser.id)) // If only the creator should write, for instance
          ]
        );
      } else {
        // Update existing firm document in Appwrite
        await databases.updateDocument(
          import.meta.env.PUBLIC_APPWRITE_DATABASE_ID,
          import.meta.env.PUBLIC_APPWRITE_FIRMS_COLLECTION_ID,
          currentFirm.$id, // Use Appwrite's document ID for update
          firmDataToSave
        );
      }

      toast.success(
        currentFirm
          ? "Firm updated successfully."
          : "Firm created successfully."
      );
      setIsDialogOpen(false);
      fetchFirms(); // Re-fetch firms to update the list
    } catch (err: any) {
      console.error("Error saving firm:", err.message);
      let userFacingMessage = "Failed to save firm.";
      if (
        err.code === 409 &&
        err.message.includes("document_attribute_unique")
      ) {
        userFacingMessage = "Firm name or contact email already exists.";
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
          onClick={fetchFirms}
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
        <h1 className="firm-management-title">Firm Management</h1>
        <Button
          onClick={handleCreateFirm}
          className="crancy-btn button--primary button--large add-firm-button"
        >
          <PlusCircle className="icon" />
          <span>Add New Firm</span>
        </Button>
      </div>

      <Card className="crancy-card firm-list-card">
        <CardHeader className="card-header">
          <CardTitle className="card-title">List of Firms</CardTitle>
          <div className="search-input-wrapper">
            <Input
              type="text"
              placeholder="Search firms..."
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
          {filteredFirms.length === 0 && !loading && !error && !searchTerm ? (
            <p className="empty-state-message">
              No firms found. Click "Add New Firm" to get started.
            </p>
          ) : (
            <>
              <div className="table-responsive">
                <Table className="crancy-table firm-table">
                  <TableHeader className="crancy-table-header firm-table-header">
                    <TableRow>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Firm Name
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Industry
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Contact Email
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Phone
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell">
                        Address
                      </TableHead>
                      <TableHead className="crancy-table-head-cell table-head-cell--actions">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="crancy-table-body firm-table-body">
                    {paginatedFirms.length === 0 && searchTerm ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="empty-results-message"
                        >
                          No results found for "{searchTerm}".
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedFirms.map((firm) => (
                        <TableRow key={firm.$id} className="firm-table-row">
                          {" "}
                          {/* Use firm.$id for key */}
                          <TableCell className="crancy-table-cell table-cell table-cell--name">
                            {firm.name}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {firm.industry || "N/A"}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell">
                            {firm.contactEmail || "N/A"}
                          </TableCell>{" "}
                          {/* Use contactEmail */}
                          <TableCell className="crancy-table-cell table-cell">
                            {firm.phoneNumber || "N/A"}
                          </TableCell>{" "}
                          {/* Use phoneNumber */}
                          <TableCell className="crancy-table-cell table-cell">
                            {firm.address || "N/A"}
                          </TableCell>
                          <TableCell className="crancy-table-cell table-cell--actions">
                            <Button
                              onClick={() => handleEditFirm(firm)}
                              className="crancy-btn button--outline button--small action-button edit-button"
                            >
                              <Edit className="icon" /> Edit
                            </Button>
                            <Button
                              onClick={() => handleDeleteFirm(firm.$id)}
                              disabled={isSubmitting}
                              className="crancy-btn button--destructive button--small action-button delete-button"
                            >
                              {" "}
                              {/* Use firm.$id */}
                              <Trash2 className="icon" /> Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {filteredFirms.length > itemsPerPage && (
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

      {/* Create/Edit Firm Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="dialog-content">
          <DialogHeader className="dialog-header">
            <div className="dialog-text-content">
              <DialogTitle className="dialog-title-text">
                {currentFirm ? "Edit Firm" : "Add New Firm"}
              </DialogTitle>
              <DialogDescription className="dialog-description-text">
                {currentFirm
                  ? "Make changes to the firm details here. Click save when you're done."
                  : "Create a new firm for your organization. Fill in the details below."}
              </DialogDescription>
            </div>
            <button
              onClick={() => setIsDialogOpen(false)}
              className="dialog-close-button"
              aria-label="Close"
            >
              X
            </button>
          </DialogHeader>
          <form onSubmit={handleSaveFirm} className="dialog-form">
            <div className="form-group">
              <Label htmlFor="name" className="crancy-label form-label">
                Firm Name*
              </Label>
              <Input
                id="name"
                value={firmFormData.name || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
              />
            </div>
            <div className="form-group">
              <Label htmlFor="industry" className="crancy-label form-label">
                Industry
              </Label>
              <Input
                id="industry"
                value={firmFormData.industry || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
              />
            </div>
            <div className="form-group">
              <Label
                htmlFor="contactEmail" // Use contactEmail for ID
                className="crancy-label form-label"
              >
                Contact Email*
              </Label>
              <Input
                id="contactEmail" // Use contactEmail for ID
                type="email"
                value={firmFormData.contactEmail || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
              />
            </div>
            <div className="form-group">
              <Label htmlFor="phoneNumber" className="crancy-label form-label">
                {" "}
                {/* Use phoneNumber for ID */}
                Phone
              </Label>
              <Input
                id="phoneNumber" // Use phoneNumber for ID
                value={firmFormData.phoneNumber || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="address" className="crancy-label form-label">
                Address
              </Label>
              <Input
                id="address"
                value={firmFormData.address || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
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
                  currentFirm ? (
                    <>
                      <Loader2 className="icon-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Loader2 className="icon-spin" /> Creating...
                    </>
                  )
                ) : currentFirm ? (
                  "Save Changes"
                ) : (
                  "Create Firm"
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
