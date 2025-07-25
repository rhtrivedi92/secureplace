// src/components/management/LocationManagement.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
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

// IMPORTANT: Dynamically import InteractiveMap to prevent SSR issues with Leaflet
// This will ensure InteractiveMap (and thus Leaflet) only runs on the client.
// We assign it to a variable, which is then used as a React component.
const InteractiveMap = React.lazy(() => import("../common/InteractiveMap"));

// Define interfaces for type safety
interface Location {
  id: string;
  firm_id: string; // Firm ID is mandatory for locations
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

interface UserData {
  id: string;
  email?: string;
  role: string;
  firmId: string | null; // This will be the Firm Admin's firm_id
}

interface LocationManagementProps {
  user: UserData;
}

export default function LocationManagement({ user }: LocationManagementProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [locationFormData, setLocationFormData] = useState<Partial<Location>>(
    {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

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
      if (!user.firmId) {
        throw new Error(
          "Firm Admin must be assigned to a firm to manage locations."
        );
      }

      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("firm_id", user.firmId)
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }
      setLocations(data || []);
    } catch (err: any) {
      console.error("Error fetching locations:", err.message);
      setError("Failed to load locations: " + err.message);
      toast.error("Failed to load locations: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [user.firmId]);

  useEffect(() => {
    if (user.role !== "firm_admin") {
      toast.error("Access Denied: Only Firm Admins can manage locations.", {
        autoClose: 3000,
      });
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 3000);
      setLoading(false);
      return;
    }
    if (user.role === "firm_admin" && !user.firmId) {
      setError(
        "Firm Admin not assigned to a firm. Please contact your Super Admin."
      );
      setLoading(false);
      toast.error("You are not assigned to a firm. Cannot manage locations.");
      return;
    }

    fetchLocations();
  }, [user.role, user.firmId, fetchLocations]);

  const handleCreateLocation = () => {
    setCurrentLocation(null);
    setLocationFormData({
      firm_id: user.firmId || "",
      latitude: null,
      longitude: null,
      // Default to a central point if map has no lat/lng
      // (e.g., initial map center like Ahmedabad)
      // This is handled by InteractiveMap's defaultCenter, but populate form too if needed
    });
    setIsDialogOpen(true);
  };

  const handleEditLocation = (location: Location) => {
    setCurrentLocation(location);
    setLocationFormData(location);
    setIsDialogOpen(true);
  };

  const handleDeleteLocation = async (
    locationId: string,
    locationName: string
  ) => {
    if (
      !window.confirm(
        `Are you sure you want to delete location "${locationName}"? This action cannot be undone.`
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("locations")
        .delete()
        .eq("id", locationId);

      if (error) {
        throw error;
      }
      toast.success("Location deleted successfully.");
      fetchLocations();
    } catch (err: any) {
      console.error("Error deleting location:", err.message);
      toast.error("Failed to delete location: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
      locationFormData.firm_id = user.firmId || "";

      const { data, error } = currentLocation
        ? await supabase
            .from("locations")
            .update(locationFormData)
            .eq("id", currentLocation.id)
            .select()
        : await supabase.from("locations").insert(locationFormData).select();

      if (error) {
        throw error;
      }

      toast.success(
        currentLocation
          ? "Location updated successfully."
          : "Location created successfully."
      );
      setIsDialogOpen(false);
      fetchLocations();
    } catch (err: any) {
      console.error("Error saving location:", err.message);
      let userFacingMessage = "Failed to save location.";
      if (
        err.message.includes(
          'duplicate key value violates unique constraint "locations_firm_id_name_key"'
        )
      ) {
        userFacingMessage =
          "A location with this name already exists for your firm.";
      }
      toast.error(
        userFacingMessage +
          (err.message.includes("AuthApiError") ? "" : " " + err.message)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && user.role === "firm_admin") {
    return (
      <div className="admin-loading-screen">
        <Loader2 className="loading-spinner" />
        <p className="loading-text">Loading locations...</p>
      </div>
    );
  }

  if (error && user.role === "firm_admin") {
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

  if (user.role !== "firm_admin") {
    return null;
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
              {filteredLocations.map((location) => (
                <Card key={location.id} className="crancy-card location-card">
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
                          handleDeleteLocation(location.id, location.name)
                        }
                        disabled={isSubmitting}
                        className="crancy-btn button--destructive button--small action-button delete-button"
                      >
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
            <button
              onClick={() => setIsDialogOpen(false)}
              className="dialog-close-button"
              aria-label="Close"
            >
              X
            </button>
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
