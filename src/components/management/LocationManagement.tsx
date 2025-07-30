"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { account, databases } from "@/lib/appwrite"; // Import Appwrite services
import { Query, Permission, Role, ID } from "appwrite"; // Import Query, Permission, Role, ID
import type { Models } from "appwrite"; // Import Models for Appwrite document types

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  MapPin,
  Building,
  Phone,
  Mail,
  Home,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvent,
} from "react-leaflet";
import "leaflet/dist/leaflet.css"; // Import Leaflet's CSS
import L from "leaflet"; // Import Leaflet library itself

// Fix for default Leaflet marker icons not showing up with Webpack/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

// Component to handle map clicks for new marker placement
function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (latlng: L.LatLng) => void;
}) {
  useMapEvent("click", (e) => {
    onMapClick(e.latlng);
  });
  return null;
}

// Dynamically import InteractiveMap to prevent SSR issues with Leaflet
const InteractiveMap = React.lazy(() => import("../common/InteractiveMap"));

// Define interfaces for type safety, extending Models.Document for Appwrite
interface AppwriteLocation extends Models.Document {
  // Represents a document in 'locations' collection
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  firmId: string; // The firm's Document ID this location belongs to
}

// User Profile interface from Appwrite Database
interface AppwriteProfile extends Models.Document {
  userId: string;
  fullName: string | null;
  officialEmail: string;
  role: string;
  firmId: string | null; // The assigned firm's Document ID
}

// Interface for user data used internally by the component
interface UserData {
  id: string; // Appwrite User ID
  email?: string;
  role: string;
  firmId: string | null; // This will be the Firm Admin's firm's Document ID
}

interface LocationManagementProps {
  // No props from Astro page in this client-side protection model
}

export default function LocationManagement({}: LocationManagementProps) {
  const [locations, setLocations] = useState<AppwriteLocation[]>([]); // Use AppwriteLocation
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null); // State for current user

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentLocation, setCurrentLocation] =
    useState<AppwriteLocation | null>(null); // Use AppwriteLocation
  // locationFormData should match AppwriteLocation attributes
  const [locationFormData, setLocationFormData] = useState<
    Partial<AppwriteLocation>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  // CRITICAL FIX: Ensure PUBLIC_APPWRITE_LOCATIONS_COLLECTION_ID is correctly used
  const LOCATIONS_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_LOCATIONS_COLLECTION_ID;
  const DATABASE_ID = import.meta.env.PUBLIC_APPWRITE_DATABASE_ID;
  const USER_PROFILES_COLLECTION_ID = import.meta.env
    .PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID;

  const filteredLocations = useMemo(() => {
    if (!searchTerm) {
      return locations;
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return locations.filter(
      (loc) =>
        loc.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        loc.address?.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [locations, searchTerm]);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Client-side guard: Only fetch data if the user is a firm_admin AND assigned to a firm
      if (!currentUser || currentUser.role !== "firm_admin") {
        console.warn(
          "Attempted to fetch locations without Firm Admin role. Data fetching aborted."
        );
        setLocations([]);
        return;
      }
      if (!currentUser.firmId) {
        console.warn(
          "Firm Admin not assigned to a firm. Cannot fetch locations."
        );
        setLocations([]);
        setError(
          "Firm Admin not assigned to a firm. Please contact your Super Admin."
        );
        return;
      }

      // Fetch locations for the current Firm Admin's firm
      // CRITICAL FIX: Pass DATABASE_ID and LOCATIONS_COLLECTION_ID correctly
      const { documents } = await databases.listDocuments<AppwriteLocation>(
        DATABASE_ID,
        LOCATIONS_COLLECTION_ID,
        [
          Query.equal("firmId", currentUser.firmId), // CRITICAL: Filter by the Firm Admin's firmId
          Query.orderAsc("name"),
        ]
      );

      setLocations(documents || []);
      console.log("Fetched Locations for firm:", documents);
    } catch (err: any) {
      console.error("Error fetching locations:", err.message);
      setError("Failed to load locations: " + err.message);
      toast.error("Failed to load locations: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser, LOCATIONS_COLLECTION_ID, DATABASE_ID]); // Added collection/db IDs to useCallback dependencies

  // Effect to perform initial authentication check and load data
  useEffect(() => {
    const checkAuthAndRole = async () => {
      setLoading(true);
      setError(null);
      try {
        const currentAppwriteUser = await account.get(); // Get current logged-in user details
        console.log(
          "LocationManagement: Appwrite User found:",
          currentAppwriteUser.$id
        );

        // CRITICAL FIX: Pass DATABASE_ID and USER_PROFILES_COLLECTION_ID correctly
        const userProfileResponse =
          await databases.listDocuments<AppwriteProfile>(
            DATABASE_ID,
            USER_PROFILES_COLLECTION_ID,
            [Query.equal("userId", currentAppwriteUser.$id), Query.limit(1)]
          );

        if (userProfileResponse.documents.length === 0) {
          console.error(
            "LocationManagement: User profile document not found for user ID:",
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
          firmId: profileData.firmId, // This is the firmId from the user's profile
        };
        setCurrentUser(fetchedUser);

        // Perform role-based redirection if unauthorized
        if (fetchedUser.role !== "firm_admin") {
          toast.error("Access Denied: Only Firm Admins can manage locations.", {
            autoClose: 3000,
          });
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 3000); // Redirect if not firm_admin
          return;
        }
        if (!fetchedUser.firmId) {
          // Firm Admin must be assigned to a firm
          toast.error(
            "Firm Admin not assigned to a firm. Please contact your Super Admin.",
            { autoClose: 3000 }
          );
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 3000); // Redirect if no firmId
          return;
        }

        console.log(
          "LocationManagement: User is Firm Admin and assigned to firm. Access granted. Proceeding to fetch locations."
        );
        // Data fetching will be triggered by the currentUser state update in the next useEffect
      } catch (err: any) {
        console.error(
          "LocationManagement: Initial auth/role check failed:",
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
  }, [DATABASE_ID, USER_PROFILES_COLLECTION_ID]); // Added collection/db IDs to useCallback dependencies

  // Effect to trigger data fetching once currentUser is successfully set and authorized
  useEffect(() => {
    if (
      currentUser &&
      currentUser.role === "firm_admin" &&
      currentUser.firmId
    ) {
      fetchLocations();
    }
  }, [currentUser, fetchLocations]);

  const handleCreateLocation = () => {
    setCurrentLocation(null);
    setLocationFormData({
      name: "",
      address: null,
      latitude: null,
      longitude: null,
      firmId: currentUser?.firmId || "", // Pre-fill firmId from current user
    });
    setIsDialogOpen(true);
  };

  const handleEditLocation = (location: AppwriteLocation) => {
    // Use AppwriteLocation
    setCurrentLocation(location);
    // Populate form data, using Appwrite's attribute names
    setLocationFormData({
      name: location.name,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      firmId: location.firmId, // Match Appwrite attribute name
    });
    setIsDialogOpen(true);
  };

  const handleDeleteLocation = async (
    locationDocId: string,
    locationName: string
  ) => {
    // Use document ID for delete
    if (
      !window.confirm(
        `Are you sure you want to delete location "${locationName}"? This action cannot be undone.`
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      // Delete document from Appwrite Database
      // CRITICAL FIX: Pass DATABASE_ID and LOCATIONS_COLLECTION_ID correctly
      await databases.deleteDocument(
        DATABASE_ID,
        LOCATIONS_COLLECTION_ID,
        locationDocId // Appwrite Document ID
      );

      toast.success("Location deleted successfully.");
      fetchLocations(); // Re-fetch locations to update the list
    } catch (err: any) {
      console.error("Error deleting location:", err.message);
      let userFacingMessage = "Failed to delete location.";
      if (err.code === 409) {
        // Conflict
        userFacingMessage =
          "Cannot delete location: It might be linked to other records or permissions prevent deletion.";
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
    setLocationFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleMapClickInDialog = useCallback((latlng: L.LatLng) => {
    setLocationFormData((prev) => ({
      ...prev,
      latitude: latlng.lat,
      longitude: latlng.lng,
    }));
    toast.info(
      `Map clicked: Lat ${latlng.lat.toFixed(4)}, Lng ${latlng.lng.toFixed(4)}`,
      { autoClose: 2000 }
    );
  }, []);

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Client-side validation
      if (
        !locationFormData.name ||
        !locationFormData.address ||
        locationFormData.latitude === null ||
        locationFormData.longitude === null
      ) {
        toast.error(
          "Location Name, Address, Latitude, and Longitude are required."
        );
        setIsSubmitting(false);
        return;
      }
      if (!currentUser || !currentUser.firmId) {
        // Double-check current user firmId
        toast.error(
          "Error: Firm Admin's firm ID not found. Cannot save location."
        );
        setIsSubmitting(false);
        return;
      }

      // Data structure for Appwrite Document (only attributes)
      const locationDataToSave = {
        name: locationFormData.name,
        address: locationFormData.address,
        latitude: locationFormData.latitude,
        longitude: locationFormData.longitude,
        firmId: currentUser.firmId, // CRITICAL: Assign Firm Admin's own firmId
      };

      if (!currentLocation) {
        // Create new location document in Appwrite
        // CRITICAL FIX: Pass DATABASE_ID and LOCATIONS_COLLECTION_ID correctly
        await databases.createDocument(
          DATABASE_ID,
          LOCATIONS_COLLECTION_ID,
          ID.unique(), // Let Appwrite generate a unique Document ID
          locationDataToSave,
          [
            // Permissions for this new location document:
            Permission.read(Role.users()),
            Permission.write(Role.users()),
            Permission.delete(Role.users()),
          ]
        );
      } else {
        // Update existing location document in Appwrite
        // CRITICAL FIX: Pass DATABASE_ID and LOCATIONS_COLLECTION_ID correctly
        await databases.updateDocument(
          DATABASE_ID,
          LOCATIONS_COLLECTION_ID,
          currentLocation.$id, // Use Appwrite's document ID for update
          locationDataToSave
        );
      }

      toast.success(
        currentLocation
          ? "Location updated successfully."
          : "Location created successfully."
      );
      setIsDialogOpen(false);
      fetchLocations(); // Re-fetch locations to update the list
    } catch (err: any) {
      console.error("Error saving location:", err.message);
      let userFacingMessage = "Failed to save location.";
      if (
        err.code === 409 &&
        err.message.includes("document_attribute_unique")
      ) {
        userFacingMessage = "Location name already exists for your firm.";
      }
      toast.error(userFacingMessage + (err.message ? ": " + err.message : ""));
    } finally {
      setIsSubmitting(false);
    }
  };

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
          onClick={fetchLocations}
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
        <h1 className="firm-management-title">Location Management</h1>
        <Button
          onClick={handleCreateLocation}
          className="crancy-btn button--primary button--large add-firm-button"
        >
          <PlusCircle className="icon" />
          <span>Add New Location</span>
        </Button>
      </div>

      <Card className="crancy-card firm-list-card">
        <CardHeader className="card-header">
          <CardTitle className="card-title">My Firm Locations</CardTitle>
          <div className="search-input-wrapper">
            <Input
              type="text"
              placeholder="Search locations by name or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="crancy-input search-input"
            />
            <Search className="search-icon" />
          </div>
        </CardHeader>
        <CardContent className="card-content">
          {filteredLocations.length === 0 &&
          !loading &&
          !error &&
          !searchTerm ? (
            <p className="empty-state-message">
              No locations found for your firm. Click "Add New Location" to get
              started.
            </p>
          ) : filteredLocations.length === 0 && searchTerm ? (
            <p className="empty-results-message">
              No results found for "{searchTerm}".
            </p>
          ) : (
            <div className="location-cards-grid">
              {" "}
              {/* Grid for location cards */}
              {filteredLocations.map((location) => (
                <Card key={location.$id} className="crancy-card location-card">
                  {" "}
                  {/* Use location.$id for key */}
                  <CardHeader className="location-card-header">
                    <CardTitle className="location-card-title">
                      <MapPin className="icon location-title-icon" />{" "}
                      {location.name}
                    </CardTitle>
                    <div className="location-card-actions">
                      <Button
                        onClick={() => handleEditLocation(location)}
                        className="crancy-btn button--outline button--small action-button edit-button"
                      >
                        <Edit className="icon" /> Edit
                      </Button>
                      <Button
                        onClick={() =>
                          handleDeleteLocation(location.$id, location.name)
                        }
                        disabled={isSubmitting}
                        className="crancy-btn button--destructive button--small action-button delete-button"
                      >
                        {" "}
                        {/* Use location.$id */}
                        <Trash2 className="icon" /> Delete
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="location-card-content">
                    <p className="location-address">
                      <Home className="icon location-detail-icon" />{" "}
                      {location.address || "Address not set"}
                    </p>
                    {/* Use React.Suspense for the dynamically imported map */}
                    {location.latitude !== null &&
                    location.longitude !== null ? (
                      <div className="location-map-wrapper">
                        <React.Suspense fallback={<div>Loading map...</div>}>
                          <InteractiveMap
                            center={[location.latitude, location.longitude]}
                            zoom={13}
                            scrollWheelZoom={false}
                            style={{
                              height: "100%",
                              width: "100%",
                              borderRadius: "8px",
                            }}
                            markerPosition={[
                              location.latitude,
                              location.longitude,
                            ]}
                            popupText={location.name}
                          />
                        </React.Suspense>
                      </div>
                    ) : (
                      <p className="no-map-data">
                        Map data not available for this location.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Location Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="dialog-content location-dialog-content">
          <DialogHeader className="dialog-header">
            <div className="dialog-text-content">
              <DialogTitle className="dialog-title-text">
                {currentLocation ? "Edit Location" : "Add New Location"}
              </DialogTitle>
              <DialogDescription className="dialog-description-text">
                {currentLocation
                  ? "Update the location details here."
                  : "Enter details for a new location. Click on the map to set coordinates."}
              </DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={handleSaveLocation} className="dialog-form">
            <div className="form-group">
              <Label htmlFor="name" className="crancy-label form-label">
                Location Name*
              </Label>
              <Input
                id="name"
                value={locationFormData.name || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
              />
            </div>
            <div className="form-group">
              <Label htmlFor="address" className="crancy-label form-label">
                Address*
              </Label>
              <Input
                id="address"
                value={locationFormData.address || ""}
                onChange={handleFormChange}
                className="crancy-input form-input"
                required
              />
            </div>
            <div className="form-group map-coordinates-group">
              <Label className="crancy-label form-label">Coordinates*</Label>
              <div className="coordinates-display">
                <Input
                  id="latitude"
                  type="number"
                  placeholder="Latitude"
                  value={locationFormData.latitude ?? ""}
                  onChange={(e) =>
                    setLocationFormData((prev) => ({
                      ...prev,
                      latitude: parseFloat(e.target.value) || null,
                    }))
                  }
                  className="crancy-input form-input coordinate-input"
                  required
                  step="any" // Allow decimal numbers
                />
                <Input
                  id="longitude"
                  type="number"
                  placeholder="Longitude"
                  value={locationFormData.longitude ?? ""}
                  onChange={(e) =>
                    setLocationFormData((prev) => ({
                      ...prev,
                      longitude: parseFloat(e.target.value) || null,
                    }))
                  }
                  className="crancy-input form-input coordinate-input"
                  required
                  step="any" // Allow decimal numbers
                />
              </div>
            </div>

            <div className="dialog-map-picker-wrapper">
              {/* Central Map picker for dialog */}
              <React.Suspense fallback={<div>Loading map picker...</div>}>
                <InteractiveMap
                  center={
                    locationFormData.latitude && locationFormData.longitude
                      ? [locationFormData.latitude, locationFormData.longitude]
                      : [23.0225, 72.5714] // Default center (Ahmedabad, India)
                  }
                  zoom={
                    locationFormData.latitude && locationFormData.longitude
                      ? 13
                      : 8
                  }
                  style={{
                    height: "300px",
                    width: "100%",
                    borderRadius: "8px",
                  }}
                  scrollWheelZoom={true}
                  markerPosition={
                    locationFormData.latitude && locationFormData.longitude
                      ? [locationFormData.latitude, locationFormData.longitude]
                      : null
                  }
                  onMapClick={handleMapClickInDialog} // Pass map click handler
                />
              </React.Suspense>
              <p className="map-picker-hint">
                Click on the map to set/update coordinates.
              </p>
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
                  currentLocation ? (
                    <>
                      <Loader2 className="icon-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Loader2 className="icon-spin" /> Creating...
                    </>
                  )
                ) : currentLocation ? (
                  "Save Changes"
                ) : (
                  "Create Location"
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
