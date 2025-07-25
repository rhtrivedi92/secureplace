// src/components/ui/button.tsx
import React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "primary"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = "button";
    // Generate class names based on props and common structure
    const baseClass = "crancy-btn"; // Use existing base button class from style.css
    let variantClass = "";
    let sizeClass = "";

    switch (variant) {
      case "primary": // Custom variant mapping to primary brand button
      case "default":
        variantClass = "button--primary"; // New custom class for your brand's primary button
        break;
      case "destructive":
        variantClass = "button--destructive";
        break;
      case "outline":
        variantClass = "button--outline";
        break;
      // Add other variants if needed
    }

    switch (size) {
      case "sm":
        sizeClass = "button--small";
        break;
      case "lg":
        sizeClass = "button--large";
        break;
      case "default":
      default:
        // No specific size class needed for default if base handles it
        break;
    }

    return (
      <Comp
        className={`${baseClass} ${variantClass} ${sizeClass} ${
          className || ""
        }`}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
export { Button };

// Make sure Input, Label, Card, Table, Dialog are similarly modified in their respective ui/*.tsx files
// They should pass through className and match your style.css existing classes where possible.
